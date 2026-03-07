package get

import (
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/atotto/clipboard"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/whisper/whisper/internal/api"
	"github.com/whisper/whisper/internal/crypto"
	"github.com/whisper/whisper/internal/ui/styles"
)

// Msg types
type (
	successMsg struct {
		plaintext string
	}
	errMsg struct {
		err error
	}
	fetchedMsg struct {
		resp *api.GetResponse
	}
	copiedMsg struct{}
)

type state int

const (
	stateFetching state = iota
	stateConfirmBurn // warn before consuming a burn-after-reading secret
	statePasswordInput
	stateDone
	stateError
)

type Model struct {
	apiClient *api.Client
	secretID  string
	base58Key string

	state         state
	spinner       spinner.Model
	passwordInput textinput.Model
	fetchedResp   *api.GetResponse
	plaintext     string
	err           error
	wrongPassword bool
	burnWarning   bool // show burn notice alongside password prompt
	copied        bool
}

func InitialModel(apiClient *api.Client, secretID, base58Key string) Model {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(styles.BrandColor)

	pi := textinput.New()
	pi.Placeholder = "Enter password..."
	pi.EchoMode = textinput.EchoPassword
	pi.EchoCharacter = '•'
	pi.CharLimit = 256
	pi.Width = 40

	return Model{
		apiClient:     apiClient,
		secretID:      secretID,
		base58Key:     base58Key,
		state:         stateFetching,
		spinner:       s,
		passwordInput: pi,
	}
}

func copyToClipboard(text string) tea.Cmd {
	return func() tea.Msg {
		_ = clipboard.WriteAll(text) // silently ignore errors (CI/headless)
		return copiedMsg{}
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		m.fetch,
	)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "esc":
			return m, tea.Quit
		case "q", "Q":
			if m.state == stateDone {
				return m, tea.Quit
			}
		case "c", "C":
			if m.state == stateDone {
				return m, copyToClipboard(m.plaintext)
			}
		}

		if m.state == statePasswordInput && msg.Type == tea.KeyEnter {
			password := m.passwordInput.Value()
			m.wrongPassword = false
			return m, m.decryptWithPassword(password)
		}

		if m.state == stateConfirmBurn && msg.Type == tea.KeyEnter {
			return m, m.decryptDirect(m.fetchedResp)
		}

	case fetchedMsg:
		m.fetchedResp = msg.resp
		if msg.resp.BurnAfterReading && !msg.resp.HasPassword {
			// Warn before consuming a burn-after-reading secret
			m.state = stateConfirmBurn
			return m, nil
		}
		if msg.resp.HasPassword {
			if msg.resp.BurnAfterReading {
				m.burnWarning = true
			}
			m.state = statePasswordInput
			m.passwordInput.Focus()
			return m, textinput.Blink
		}
		// No password, no burn warning — decrypt immediately
		return m, m.decryptDirect(msg.resp)

	case successMsg:
		m.state = stateDone
		m.plaintext = msg.plaintext
		return m, nil // linger — user presses Q to quit

	case copiedMsg:
		m.copied = true
		return m, nil

	case errMsg:
		// Wrong password: allow retry
		if m.state == statePasswordInput {
			m.wrongPassword = true
			m.passwordInput.SetValue("")
			return m, textinput.Blink
		}
		m.err = msg.err
		m.state = stateError
		return m, tea.Quit
	}

	switch m.state {
	case stateFetching:
		m.spinner, cmd = m.spinner.Update(msg)
	case statePasswordInput:
		m.passwordInput, cmd = m.passwordInput.Update(msg)
	}
	return m, cmd
}

func (m Model) View() string {
	var s strings.Builder

	s.WriteString(styles.RenderTitle("Whisper E2EE Secret"))
	s.WriteString("\n\n")

	switch m.state {
	case stateFetching:
		s.WriteString(fmt.Sprintf("%s %s", m.spinner.View(), styles.Muted.Render("Fetching secret...")))

	case stateConfirmBurn:
		s.WriteString(styles.ErrorBox.Render("Warning: this secret will be permanently deleted after reading."))
		s.WriteString("\n\n")
		s.WriteString(styles.Muted.Render("[Enter] Proceed   [Esc] Quit"))

	case statePasswordInput:
		if m.burnWarning {
			s.WriteString(styles.ErrorBox.Render("Warning: this secret will be permanently deleted after reading."))
			s.WriteString("\n\n")
		}
		if m.wrongPassword {
			s.WriteString(styles.ErrorBox.Render("Wrong password. Please try again."))
			s.WriteString("\n\n")
		}
		s.WriteString(styles.Muted.Render("This secret is password-protected:"))
		s.WriteString("\n\n")
		s.WriteString(m.passwordInput.View())
		s.WriteString("\n\n")
		s.WriteString(styles.Muted.Render("[Enter] Decrypt   [Esc] Quit"))

	case stateDone:
		s.WriteString(styles.SuccessBox.Render(m.plaintext))
		s.WriteString("\n\n")
		s.WriteString(styles.HelpText.Render("Decrypted locally. The server cannot read this."))
		s.WriteString("\n\n")
		if m.copied {
			s.WriteString(styles.SuccessText.Render("Copied!   "))
			s.WriteString(styles.Muted.Render("[Q] Quit"))
		} else {
			s.WriteString(styles.Muted.Render("[C] Copy to clipboard   [Q] Quit"))
		}

	case stateError:
		s.WriteString(styles.ErrorBox.Render(fmt.Sprintf("Error: %v", m.err)))
	}

	s.WriteString("\n")
	return styles.Base.Render(s.String())
}

// fetch fetches the encrypted payload from the server without decrypting.
func (m Model) fetch() tea.Msg {
	resp, err := m.apiClient.GetSecret(m.secretID)
	if err != nil {
		return errMsg{fmt.Errorf("failed to fetch secret: %w", err)}
	}
	return fetchedMsg{resp: resp}
}

// decryptDirect decrypts using the key from the URL fragment.
func (m Model) decryptDirect(resp *api.GetResponse) tea.Cmd {
	return func() tea.Msg {
		keyBytes, err := crypto.Base58ToKey(m.base58Key)
		if err != nil {
			return errMsg{fmt.Errorf("invalid decryption key")}
		}

		payload := &crypto.EncryptedPayload{
			Ciphertext: resp.Ciphertext,
			IV:         resp.IV,
			Salt:       resp.Salt,
		}

		plaintext, err := crypto.Decrypt(payload, keyBytes)
		if err != nil {
			return errMsg{fmt.Errorf("failed to decrypt (wrong or corrupted key)")}
		}

		return successMsg{plaintext: plaintext}
	}
}

// decryptWithPassword derives the key from the password+salt and decrypts.
func (m Model) decryptWithPassword(password string) tea.Cmd {
	resp := m.fetchedResp
	return func() tea.Msg {
		saltBytes, err := base64.StdEncoding.DecodeString(resp.Salt)
		if err != nil {
			return errMsg{fmt.Errorf("invalid salt in payload")}
		}

		keyBytes, err := crypto.DeriveKeyFromPassword(password, saltBytes)
		if err != nil {
			return errMsg{fmt.Errorf("key derivation failed: %w", err)}
		}

		payload := &crypto.EncryptedPayload{
			Ciphertext: resp.Ciphertext,
			IV:         resp.IV,
			Salt:       resp.Salt,
		}

		plaintext, err := crypto.Decrypt(payload, keyBytes)
		if err != nil {
			return errMsg{fmt.Errorf("wrong password")}
		}

		return successMsg{plaintext: plaintext}
	}
}

package create

import (
	"crypto/rand"
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/whisper/whisper/internal/api"
	"github.com/whisper/whisper/internal/crypto"
	"github.com/whisper/whisper/internal/ui/styles"
)

type state int

const (
	stateInput state = iota
	statePasswordInput
	stateEncrypting
	stateDone
	stateError
)

var expiryOptions = []string{"5m", "1h", "24h", "7d", "30d"}
var maxViewsOptions = []int{1, 2, 5, 10, 0} // 0 = unlimited

type Model struct {
	apiClient *api.Client

	state         state
	textarea      textarea.Model
	passwordInput textinput.Model
	spinner       spinner.Model
	err           error

	// Results
	finalURL string

	// Options
	burnAfterReading bool
	expiryIndex      int
	maxViewsIndex    int
	passwordEnabled  bool
	password         string
}

type successMsg struct {
	url string
}

type errMsg struct {
	err error
}

func InitialModel(apiClient *api.Client, initialText string) Model {
	ta := textarea.New()
	ta.Placeholder = "Type your secret here...\n\n(Press Ctrl+S to encrypt and share, Ctrl+C to quit)"
	ta.Focus()

	ta.Prompt = "┃ "
	ta.CharLimit = 10000
	ta.SetWidth(60)
	ta.SetHeight(10)
	ta.FocusedStyle.CursorLine = lipgloss.NewStyle()
	ta.ShowLineNumbers = false

	if initialText != "" {
		ta.SetValue(initialText)
	}

	pi := textinput.New()
	pi.Placeholder = "Enter password..."
	pi.EchoMode = textinput.EchoPassword
	pi.EchoCharacter = '•'
	pi.CharLimit = 256
	pi.Width = 40

	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(styles.BrandColor)

	m := Model{
		apiClient:        apiClient,
		state:            stateInput,
		textarea:         ta,
		passwordInput:    pi,
		spinner:          s,
		burnAfterReading: true, // Default to true for maximum safety
		expiryIndex:      2,    // Default: 24h
		maxViewsIndex:    0,    // Default: 1 view
	}

	// Auto-submit if text was piped
	if initialText != "" {
		m.state = stateEncrypting
	}

	return m
}

func (m Model) Init() tea.Cmd {
	if m.state == stateEncrypting {
		// Immediately encrypt and render spinner
		return tea.Batch(m.spinner.Tick, m.encryptAndUpload)
	}
	return textarea.Blink
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEsc:
			return m, tea.Quit

		case tea.KeyCtrlS:
			if m.state == stateInput && strings.TrimSpace(m.textarea.Value()) != "" {
				if m.passwordEnabled {
					m.state = statePasswordInput
					m.passwordInput.Focus()
					return m, textinput.Blink
				}
				m.state = stateEncrypting
				return m, tea.Batch(m.spinner.Tick, m.encryptAndUpload)
			}

		case tea.KeyEnter:
			if m.state == statePasswordInput {
				m.password = m.passwordInput.Value()
				m.state = stateEncrypting
				return m, tea.Batch(m.spinner.Tick, m.encryptAndUpload)
			}
		}

		// Option toggles (only in stateInput)
		if m.state == stateInput {
			switch msg.String() {
			case "ctrl+b":
				m.burnAfterReading = !m.burnAfterReading
				return m, nil
			case "ctrl+e":
				m.expiryIndex = (m.expiryIndex + 1) % len(expiryOptions)
				return m, nil
			case "ctrl+v":
				if !m.burnAfterReading {
					m.maxViewsIndex = (m.maxViewsIndex + 1) % len(maxViewsOptions)
				}
				return m, nil
			case "ctrl+p":
				m.passwordEnabled = !m.passwordEnabled
				return m, nil
			}
		}

	case successMsg:
		m.state = stateDone
		m.finalURL = msg.url
		return m, tea.Quit

	case errMsg:
		m.err = msg.err
		m.state = stateError
		return m, tea.Quit

	case spinner.TickMsg:
		if m.state == stateEncrypting {
			m.spinner, cmd = m.spinner.Update(msg)
			cmds = append(cmds, cmd)
		}
	}

	switch m.state {
	case stateInput:
		m.textarea, cmd = m.textarea.Update(msg)
		cmds = append(cmds, cmd)
	case statePasswordInput:
		m.passwordInput, cmd = m.passwordInput.Update(msg)
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

func (m Model) View() string {
	var s strings.Builder

	s.WriteString(styles.RenderTitle("Whisper: Share a Secret"))
	s.WriteString("\n\n")

	switch m.state {
	case stateInput:
		s.WriteString(m.textarea.View())
		s.WriteString("\n\n")

		// Burn after reading
		s.WriteString(styles.Muted.Render("[Ctrl+B] Burn after reading: "))
		if m.burnAfterReading {
			s.WriteString(styles.SuccessText.Render("ON"))
		} else {
			s.WriteString(styles.HighlightText.Render("OFF"))
		}
		s.WriteString("\n")

		// Expiry
		s.WriteString(styles.Muted.Render("[Ctrl+E] Expires in: "))
		s.WriteString(styles.HighlightText.Render(expiryOptions[m.expiryIndex]))
		s.WriteString("\n")

		// Max views
		s.WriteString(styles.Muted.Render("[Ctrl+V] Max views: "))
		if m.burnAfterReading {
			s.WriteString(styles.Muted.Render("1 (burn locked)"))
		} else {
			s.WriteString(styles.HighlightText.Render(formatMaxViews(maxViewsOptions[m.maxViewsIndex])))
		}
		s.WriteString("\n")

		// Password
		s.WriteString(styles.Muted.Render("[Ctrl+P] Password: "))
		if m.passwordEnabled {
			s.WriteString(styles.SuccessText.Render("ON"))
		} else {
			s.WriteString(styles.HighlightText.Render("OFF"))
		}
		s.WriteString("\n\n")

		s.WriteString(styles.Muted.Render("[Ctrl+S] Submit   [Esc] Quit"))

	case statePasswordInput:
		s.WriteString(styles.Muted.Render("Enter a password for this secret:"))
		s.WriteString("\n\n")
		s.WriteString(m.passwordInput.View())
		s.WriteString("\n\n")
		s.WriteString(styles.Muted.Render("[Enter] Confirm   [Esc] Quit"))

	case stateEncrypting:
		s.WriteString(fmt.Sprintf("%s %s", m.spinner.View(), styles.Muted.Render("Encrypting and uploading securely...")))

	case stateDone:
		if m.password != "" {
			s.WriteString(styles.SuccessBox.Render(
				fmt.Sprintf("%s\n\n%s",
					styles.Highlight.Render("Secret encrypted and ready to share!"),
					styles.URLStyle.Render(m.finalURL),
				),
			))
			s.WriteString("\n\n")
			s.WriteString(styles.HelpText.Render("Password-protected. Share the URL and password separately."))
		} else {
			s.WriteString(styles.SuccessBox.Render(
				fmt.Sprintf("%s\n\n%s",
					styles.Highlight.Render("Secret encrypted and ready to share!"),
					styles.URLStyle.Render(m.finalURL),
				),
			))
			s.WriteString("\n\n")
			s.WriteString(styles.HelpText.Render("The decryption key is embedded in the URL fragment (#). It is never sent to the server."))
		}

	case stateError:
		s.WriteString(styles.ErrorBox.Render(fmt.Sprintf("Error: %v", m.err)))
	}

	s.WriteString("\n")
	return styles.Base.Render(s.String())
}

func formatMaxViews(n int) string {
	if n == 0 {
		return "unlimited"
	}
	return fmt.Sprintf("%d", n)
}

// encryptAndUpload runs the core cryptography pipeline and posts to the API
func (m Model) encryptAndUpload() tea.Msg {
	plaintext := m.textarea.Value()

	var payload *crypto.EncryptedPayload
	var hasPassword bool

	if m.password != "" {
		// Password flow: derive key from password + random salt
		salt := make([]byte, 16)
		if _, err := rand.Read(salt); err != nil {
			return errMsg{fmt.Errorf("generating salt: %w", err)}
		}

		keyBytes, err := crypto.DeriveKeyFromPassword(m.password, salt)
		if err != nil {
			return errMsg{fmt.Errorf("deriving key: %w", err)}
		}

		payload, err = crypto.EncryptWithKey(plaintext, keyBytes, salt)
		if err != nil {
			return errMsg{fmt.Errorf("encrypting: %w", err)}
		}
		hasPassword = true
	} else {
		// Standard flow: random key
		keyBytes, err := crypto.GenerateKey()
		if err != nil {
			return errMsg{fmt.Errorf("generating key: %w", err)}
		}

		payload, err = crypto.Encrypt(plaintext, keyBytes)
		if err != nil {
			return errMsg{fmt.Errorf("encrypting: %w", err)}
		}

		// Encode key and forge URL with fragment
		base58Key := crypto.KeyToBase58(keyBytes)
		maxViews := maxViewsOptions[m.maxViewsIndex]
		if m.burnAfterReading {
			maxViews = 1
		}

		req := &api.CreateRequest{
			Ciphertext:       payload.Ciphertext,
			IV:               payload.IV,
			Salt:             payload.Salt,
			ExpiresIn:        expiryOptions[m.expiryIndex],
			BurnAfterReading: m.burnAfterReading,
			MaxViews:         maxViews,
		}

		resp, err := m.apiClient.CreateSecret(req)
		if err != nil {
			return errMsg{fmt.Errorf("uploading to server: %w", err)}
		}

		finalURL := fmt.Sprintf("%s/s/%s#%s", m.apiClient.BaseURL, resp.ID, base58Key)
		return successMsg{url: finalURL}
	}

	// Password path continues here
	maxViews := maxViewsOptions[m.maxViewsIndex]
	if m.burnAfterReading {
		maxViews = 1
	}

	req := &api.CreateRequest{
		Ciphertext:       payload.Ciphertext,
		IV:               payload.IV,
		Salt:             payload.Salt,
		ExpiresIn:        expiryOptions[m.expiryIndex],
		BurnAfterReading: m.burnAfterReading,
		MaxViews:         maxViews,
		HasPassword:      hasPassword,
	}

	resp, err := m.apiClient.CreateSecret(req)
	if err != nil {
		return errMsg{fmt.Errorf("uploading to server: %w", err)}
	}

	// No key in fragment for password-protected secrets
	finalURL := fmt.Sprintf("%s/s/%s", m.apiClient.BaseURL, resp.ID)
	return successMsg{url: finalURL}
}

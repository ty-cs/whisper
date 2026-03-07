package get

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
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
)

type state int

const (
	stateFetching state = iota
	stateDone
	stateError
)

type Model struct {
	apiClient *api.Client
	secretID  string
	base58Key string

	state     state
	spinner   spinner.Model
	plaintext string
	err       error
}

func InitialModel(apiClient *api.Client, secretID, base58Key string) Model {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(styles.BrandColor)

	return Model{
		apiClient: apiClient,
		secretID:  secretID,
		base58Key: base58Key,
		state:     stateFetching,
		spinner:   s,
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		m.fetchAndDecrypt,
	)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c", "esc":
			return m, tea.Quit
		}

	case successMsg:
		m.state = stateDone
		m.plaintext = msg.plaintext
		return m, tea.Quit // We exit the TUI automatically once displayed

	case errMsg:
		m.err = msg.err
		m.state = stateError
		return m, tea.Quit // Exit on error too
	}

	var cmd tea.Cmd
	if m.state == stateFetching {
		m.spinner, cmd = m.spinner.Update(msg)
	}
	return m, cmd
}

func (m Model) View() string {
	var s strings.Builder

	s.WriteString(styles.RenderTitle("Whisper E2EE Secret"))
	s.WriteString("\n\n")

	switch m.state {
	case stateFetching:
		s.WriteString(fmt.Sprintf("%s %s", m.spinner.View(), styles.Muted.Render("Decrypting secret...")))

	case stateDone:
		content := styles.SuccessBox.Render(m.plaintext)
		s.WriteString(content)
		s.WriteString("\n\n")
		s.WriteString(styles.HelpText.Render("Decrypted locally. The server cannot read this."))

	case stateError:
		content := styles.ErrorBox.Render(fmt.Sprintf("Error: %v", m.err))
		s.WriteString(content)
	}

	s.WriteString("\n")
	return styles.Base.Render(s.String())
}

// fetchAndDecrypt is a tea.Cmd that hits the API and decrypts the payload.
func (m Model) fetchAndDecrypt() tea.Msg {
	// 1. Fetch encrypted payload
	resp, err := m.apiClient.GetSecret(m.secretID)
	if err != nil {
		return errMsg{fmt.Errorf("failed to fetch secret: %w", err)}
	}

	// 2. Decode the key from the URL fragment
	keyBytes, err := crypto.Base58ToKey(m.base58Key)
	if err != nil {
		return errMsg{fmt.Errorf("invalid decryption key")}
	}

	// 3. Construct the payload
	payload := &crypto.EncryptedPayload{
		Ciphertext: resp.Ciphertext,
		IV:         resp.IV,
		Salt:       resp.Salt,
	}

	// 4. Decrypt
	plaintext, err := crypto.Decrypt(payload, keyBytes)
	if err != nil {
		return errMsg{fmt.Errorf("failed to decrypt (wrong or corrupted key)")}
	}

	return successMsg{plaintext: plaintext}
}

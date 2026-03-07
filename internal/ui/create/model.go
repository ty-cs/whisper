package create

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/whisper/whisper/internal/api"
	"github.com/whisper/whisper/internal/crypto"
	"github.com/whisper/whisper/internal/ui/styles"
)

type state int

const (
	stateInput state = iota
	stateEncrypting
	stateDone
	stateError
)

type Model struct {
	apiClient *api.Client

	state    state
	textarea textarea.Model
	spinner  spinner.Model
	err      error

	// Results
	finalURL string

	// Options
	burnAfterReading bool
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

	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(styles.BrandColor)

	m := Model{
		apiClient:        apiClient,
		state:            stateInput,
		textarea:         ta,
		spinner:          s,
		burnAfterReading: true, // Default to true for maximum safety
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
			// Trigger encryption and upload
			if m.state == stateInput && strings.TrimSpace(m.textarea.Value()) != "" {
				m.state = stateEncrypting
				return m, tea.Batch(m.spinner.Tick, m.encryptAndUpload)
			}
		}

		// Option toggles
		if m.state == stateInput {
			if msg.String() == "ctrl+b" {
				m.burnAfterReading = !m.burnAfterReading
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

	if m.state == stateInput {
		m.textarea, cmd = m.textarea.Update(msg)
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

		// Options bar
		burnText := styles.Muted.Render("[Ctrl+B] Burn after reading: ")
		burnVal := styles.HighlightText.Render("OFF")
		if m.burnAfterReading {
			burnVal = styles.SuccessText.Render("ON")
		}
		s.WriteString(burnText + burnVal + "\n")
		s.WriteString(styles.Muted.Render("[Ctrl+S] Submit   [Esc] Quit"))

	case stateEncrypting:
		s.WriteString(fmt.Sprintf("%s %s", m.spinner.View(), styles.Muted.Render("Encrypting and uploading securely...")))

	case stateDone:
		s.WriteString(styles.SuccessBox.Render(
			fmt.Sprintf("%s\n\n%s",
				styles.Highlight.Render("Secret encrypted and ready to share!"),
				styles.URLStyle.Render(m.finalURL),
			),
		))
		s.WriteString("\n\n")
		s.WriteString(styles.HelpText.Render("The decryption key is embedded in the URL fragment (#). It is never sent to the server."))

	case stateError:
		s.WriteString(styles.ErrorBox.Render(fmt.Sprintf("Error: %v", m.err)))
	}

	s.WriteString("\n")
	return styles.Base.Render(s.String())
}

// encryptAndUpload runs the core cryptography pipeline and posts to the API
func (m Model) encryptAndUpload() tea.Msg {
	plaintext := m.textarea.Value()

	// 1. Generate 256-bit encryption key
	keyBytes, err := crypto.GenerateKey()
	if err != nil {
		return errMsg{fmt.Errorf("generating key: %w", err)}
	}

	// 2. Encrypt plaintext
	payload, err := crypto.Encrypt(plaintext, keyBytes)
	if err != nil {
		return errMsg{fmt.Errorf("encrypting: %w", err)}
	}

	// 3. Post to API
	maxViews := 0
	if m.burnAfterReading {
		maxViews = 1 // Enforce single view if burned
	}

	req := &api.CreateRequest{
		Ciphertext:       payload.Ciphertext,
		IV:               payload.IV,
		Salt:             payload.Salt,
		ExpiresIn:        "24h", // Hardcoding 24h for now in UI, can build toggle later
		BurnAfterReading: m.burnAfterReading,
		MaxViews:         maxViews,
	}

	resp, err := m.apiClient.CreateSecret(req)
	if err != nil {
		return errMsg{fmt.Errorf("uploading to server: %w", err)}
	}

	// 4. Encode key and forge URL
	base58Key := crypto.KeyToBase58(keyBytes)
	finalURL := fmt.Sprintf("%s/s/%s#%s", m.apiClient.BaseURL, resp.ID, base58Key)

	return successMsg{url: finalURL}
}

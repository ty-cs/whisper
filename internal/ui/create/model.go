package create

import (
	"crypto/rand"
	"fmt"
	"strings"

	"github.com/atotto/clipboard"
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

// Options configures the create model. Flag values wire into TUI initial state
// and serve as the headless encryption parameters.
type Options struct {
	APIClient        *api.Client
	InitialText      string
	AutoSubmit       bool
	ExpiresIn        string // must be a valid expiryOptions value (e.g. "24h")
	BurnAfterReading bool
	MaxViews         int
	InitialPassword  string
}

type Model struct {
	apiClient *api.Client

	state         state
	textarea      textarea.Model
	passwordInput textinput.Model
	spinner       spinner.Model
	err           error

	// Results
	finalURL string
	copied   bool
	showHelp bool

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

type copiedMsg struct{}

func copyToClipboard(text string) tea.Cmd {
	return func() tea.Msg {
		_ = clipboard.WriteAll(text) // silently ignore errors (CI/headless)
		return copiedMsg{}
	}
}

func InitialModel(opts Options) Model {
	ta := textarea.New()
	ta.Placeholder = "Type your secret here...\n\n(Press Ctrl+S to encrypt and share, Ctrl+C to quit)"
	ta.Focus()

	ta.Prompt = "┃ "
	ta.CharLimit = 10000
	ta.SetWidth(60)
	ta.SetHeight(10)
	ta.FocusedStyle.CursorLine = lipgloss.NewStyle()
	ta.ShowLineNumbers = false

	if opts.InitialText != "" {
		ta.SetValue(opts.InitialText)
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

	// Map ExpiresIn string to index (default: "24h" = index 2)
	expiryIndex := 2
	for i, e := range expiryOptions {
		if e == opts.ExpiresIn {
			expiryIndex = i
			break
		}
	}

	// Map MaxViews to index (0 = not set → default index 0 = 1 view)
	maxViewsIndex := 0
	if opts.MaxViews != 0 {
		for i, mv := range maxViewsOptions {
			if mv == opts.MaxViews {
				maxViewsIndex = i
				break
			}
		}
	}

	m := Model{
		apiClient:        opts.APIClient,
		state:            stateInput,
		textarea:         ta,
		passwordInput:    pi,
		spinner:          s,
		burnAfterReading: opts.BurnAfterReading,
		expiryIndex:      expiryIndex,
		maxViewsIndex:    maxViewsIndex,
		passwordEnabled:  opts.InitialPassword != "",
		password:         opts.InitialPassword,
	}

	if opts.AutoSubmit {
		m.state = stateEncrypting
	}

	return m
}

func (m Model) Init() tea.Cmd {
	if m.state == stateEncrypting {
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
				// If password enabled but not yet set, prompt for it
				if m.passwordEnabled && m.password == "" {
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

		// Option toggles (only in stateInput) — intercept before textarea
		if m.state == stateInput {
			// '?' must be caught before the textarea consumes it
			if msg.String() == "?" {
				m.showHelp = !m.showHelp
				return m, nil
			}
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
		// Attempt clipboard copy; quit on copiedMsg
		return m, copyToClipboard(msg.url)

	case copiedMsg:
		m.copied = true
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

		// Options status lines (always visible)
		s.WriteString(styles.Muted.Render("[Ctrl+B] Burn after reading: "))
		if m.burnAfterReading {
			s.WriteString(styles.SuccessText.Render("ON"))
		} else {
			s.WriteString(styles.HighlightText.Render("OFF"))
		}
		s.WriteString("\n")

		s.WriteString(styles.Muted.Render("[Ctrl+E] Expires in: "))
		s.WriteString(styles.HighlightText.Render(expiryOptions[m.expiryIndex]))
		s.WriteString("\n")

		s.WriteString(styles.Muted.Render("[Ctrl+V] Max views: "))
		if m.burnAfterReading {
			s.WriteString(styles.Muted.Render("1 (burn locked)"))
		} else {
			s.WriteString(styles.HighlightText.Render(formatMaxViews(maxViewsOptions[m.maxViewsIndex])))
		}
		s.WriteString("\n")

		s.WriteString(styles.Muted.Render("[Ctrl+P] Password: "))
		if m.passwordEnabled {
			s.WriteString(styles.SuccessText.Render("ON"))
		} else {
			s.WriteString(styles.HighlightText.Render("OFF"))
		}
		s.WriteString("\n\n")

		if m.showHelp {
			s.WriteString(styles.Muted.Render("Keybindings:"))
			s.WriteString("\n")
			s.WriteString(styles.Muted.Render("  [Ctrl+S]  Submit (encrypt and upload)"))
			s.WriteString("\n")
			s.WriteString(styles.Muted.Render("  [Ctrl+B]  Toggle burn-after-reading"))
			s.WriteString("\n")
			s.WriteString(styles.Muted.Render("  [Ctrl+E]  Cycle expiry time"))
			s.WriteString("\n")
			s.WriteString(styles.Muted.Render("  [Ctrl+V]  Cycle max views (when burn is OFF)"))
			s.WriteString("\n")
			s.WriteString(styles.Muted.Render("  [Ctrl+P]  Toggle password protection"))
			s.WriteString("\n")
			s.WriteString(styles.Muted.Render("  [?]       Toggle this help"))
			s.WriteString("\n")
			s.WriteString(styles.Muted.Render("  [Esc]     Quit"))
		} else {
			s.WriteString(styles.Muted.Render("[?] Help   [Ctrl+S] Submit   [Esc] Quit"))
		}

	case statePasswordInput:
		s.WriteString(styles.Muted.Render("Enter a password for this secret:"))
		s.WriteString("\n\n")
		s.WriteString(m.passwordInput.View())
		s.WriteString("\n\n")
		s.WriteString(styles.Muted.Render("[Enter] Confirm   [Esc] Quit"))

	case stateEncrypting:
		s.WriteString(fmt.Sprintf("%s %s", m.spinner.View(), styles.Muted.Render("Encrypting and uploading securely...")))

	case stateDone:
		s.WriteString(styles.GutterBrand.Render(" ◆") + "  " + styles.Highlight.Render("Secret encrypted and ready to share."))
		s.WriteString("\n\n")
		s.WriteString(styles.Indent.Render(styles.URLStyle.Render(m.finalURL)))
		s.WriteString("\n\n")
		if m.password != "" {
			s.WriteString(styles.Indent.Render(styles.Muted.Render("Password-protected. Share the URL and password separately.")))
		} else {
			s.WriteString(styles.Indent.Render(styles.Muted.Render("The decryption key is in the URL fragment (#). It is never sent to the server.")))
		}
		if m.copied {
			s.WriteString("\n\n")
			s.WriteString(styles.GutterSuccess.Render(" ✓") + "  " + styles.SuccessText.Render("Copied to clipboard"))
		}

	case stateError:
		s.WriteString(styles.GutterError.Render(" ✗") + "  " + styles.Muted.Render(fmt.Sprintf("Error: %v", m.err)))
	}

	return styles.Base.Render(s.String() + "\n\n")
}

func formatMaxViews(n int) string {
	if n == 0 {
		return "unlimited"
	}
	return fmt.Sprintf("%d", n)
}

// encryptAndUpload runs the core cryptography pipeline and posts to the API.
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

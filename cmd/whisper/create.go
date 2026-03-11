package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/ty-cs/whisper/internal/api"
	"github.com/ty-cs/whisper/internal/crypto"
	createUI "github.com/ty-cs/whisper/internal/ui/create"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func createCmd() *cobra.Command {
	var server string
	var text string
	var file string
	var expires string
	var burn bool
	var maxViews int
	var quiet bool
	var jsonOutput bool
	var password string

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create an encrypted secret",
		Long: `Open an interactive UI to type and encrypt a secret locally before uploading.
Returns a shareable URL containing the decryption key.

Reads from stdin if piped, skipping the typing interface.`,
		Example: `  whisper create
  whisper create --text "my secret"
  whisper create --file credentials.txt
  echo "my secret" | whisper create
  whisper create --text "inline" --expires 5m --quiet
  whisper create --text "json test" --json`,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runCreate(cmd, server, text, file, expires, burn, maxViews, quiet, jsonOutput, password)
		},
	}

	cmd.Flags().StringVarP(&server, "server", "s", "", "API server URL")
	cmd.Flags().StringVarP(&text, "text", "t", "", "Secret text (skips TUI input)")
	cmd.Flags().StringVarP(&file, "file", "f", "", "Read secret from file (skips TUI input)")
	cmd.Flags().StringVarP(&expires, "expires", "e", "24h", "Expiry time (5m, 1h, 24h, 7d, 30d)")
	cmd.Flags().BoolVar(&burn, "burn", false, "Burn after reading (deleted after first view)")
	cmd.Flags().IntVarP(&maxViews, "max-views", "m", 0, "Max view count (0=unlimited; >1 disables --burn)")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Output only the URL (no TUI)")
	cmd.Flags().BoolVarP(&jsonOutput, "json", "j", false, `Output JSON {"url":"...","id":"...","expiresAt":N}`)
	cmd.Flags().StringVar(&password, "password", "", "Password-protect the secret")

	return cmd
}

func runCreate(cmd *cobra.Command, server, text, file, expires string, burn bool, maxViews int, quiet, jsonOutput bool, password string) error {
	if quiet && jsonOutput {
		return fmt.Errorf("--quiet and --json are mutually exclusive")
	}

	// Validate --expires
	validExpiries := []string{"5m", "1h", "24h", "7d", "30d"}
	validExpiry := false
	for _, v := range validExpiries {
		if v == expires {
			validExpiry = true
			break
		}
	}
	if !validExpiry {
		return fmt.Errorf("invalid --expires value %q; must be one of: 5m, 1h, 24h, 7d, 30d", expires)
	}

	if maxViews < 0 || maxViews > 10000 {
		return fmt.Errorf("invalid --max-views value %d; must be between 0 and 10000", maxViews)
	}

	if burn && maxViews > 1 {
		return fmt.Errorf("--burn and --max-views are mutually exclusive; --burn limits to 1 view")
	}

	burnAfterReading := burn
	baseURL := resolveServer(server)
	if err := api.ValidateBaseURL(baseURL); err != nil {
		return err
	}

	// Determine input source and enforce mutual exclusion
	textChanged := cmd.Flags().Changed("text")
	fileChanged := cmd.Flags().Changed("file")
	stdinPiped := !isTerminalStdin()

	sources := 0
	if textChanged {
		sources++
	}
	if fileChanged {
		sources++
	}
	if stdinPiped {
		sources++
	}
	if sources > 1 {
		return fmt.Errorf("multiple input sources; use only one of --text, --file, or piped stdin")
	}

	var initialText string
	var autoSubmit bool

	if textChanged {
		initialText = text
		autoSubmit = true
	} else if fileChanged {
		data, err := os.ReadFile(file)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("file not found: %s", file)
			}
			if os.IsPermission(err) {
				return fmt.Errorf("permission denied: %s", file)
			}
			return fmt.Errorf("reading file: %w", err)
		}
		initialText = string(data)
		autoSubmit = true
	} else if stdinPiped {
		var err error
		initialText, err = readPipedSecret()
		if err != nil {
			return err
		}
		autoSubmit = true
	}

	// Headless path (--quiet or --json)
	if quiet || jsonOutput {
		if initialText == "" {
			return fmt.Errorf("input required in headless mode; use --text, --file, or pipe stdin")
		}
		client := api.NewClient(baseURL)
		return headlessCreate(client, initialText, expires, burnAfterReading, maxViews, password, jsonOutput)
	}

	// TUI path
	apiClient := api.NewClient(baseURL)
	opts := createUI.Options{
		APIClient:        apiClient,
		InitialText:      initialText,
		AutoSubmit:       autoSubmit,
		ExpiresIn:        expires,
		BurnAfterReading: burnAfterReading,
		MaxViews:         maxViews,
		InitialPassword:  password,
	}
	m := createUI.InitialModel(opts)
	p := tea.NewProgram(m)

	if _, err := p.Run(); err != nil {
		return fmt.Errorf("UI crashed: %w", err)
	}

	return nil
}

func headlessCreate(client *api.Client, text, expiresIn string, burnAfterReading bool, maxViews int, password string, jsonOutput bool) error {
	var payload *crypto.EncryptedPayload
	var hasPassword bool
	var base58Key string

	urlKey, err := crypto.GenerateKey()
	if err != nil {
		return fmt.Errorf("generating key: %w", err)
	}
	base58Key = crypto.KeyToBase58(urlKey)

	if password != "" {
		keyBytes, err := crypto.DeriveKeyFromPassword(password, urlKey)
		if err != nil {
			return fmt.Errorf("deriving key: %w", err)
		}
		payload, err = crypto.Encrypt(text, keyBytes)
		if err != nil {
			return fmt.Errorf("encrypting: %w", err)
		}
		hasPassword = true
	} else {
		var encErr error
		payload, encErr = crypto.Encrypt(text, urlKey)
		if encErr != nil {
			return fmt.Errorf("encrypting: %w", encErr)
		}
	}

	mv := maxViews
	if burnAfterReading {
		mv = 1 // enforce single-view on the server side
	}

	req := &api.CreateRequest{
		Ciphertext:       payload.Ciphertext,
		IV:               payload.IV,
		ExpiresIn:        expiresIn,
		BurnAfterReading: burnAfterReading,
		MaxViews:         mv,
		HasPassword:      hasPassword,
	}

	resp, err := client.CreateSecret(req)
	if err != nil {
		return err
	}

	finalURL := fmt.Sprintf("%s/s/%s#%s", client.BaseURL, resp.ID, base58Key)

	if jsonOutput {
		data, _ := json.Marshal(map[string]interface{}{
			"url":       finalURL,
			"id":        resp.ID,
			"expiresAt": resp.ExpiresAt,
		})
		fmt.Println(string(data))
	} else {
		fmt.Println(finalURL)
	}
	return nil
}

// readPipedSecret reads all of stdin (caller must ensure stdin is piped).
// Total input is capped at 512 KB.
func readPipedSecret() (string, error) {
	const limit = 512 * 1024
	lr := &io.LimitedReader{R: os.Stdin, N: limit + 1}
	data, err := io.ReadAll(lr)
	if err != nil {
		return "", fmt.Errorf("reading stdin: %w", err)
	}
	if len(data) > limit {
		return "", fmt.Errorf("stdin input exceeds 512 KB limit")
	}
	return strings.TrimSuffix(string(data), "\n"), nil
}

func resolveServer(flag string) string {
	if flag != "" {
		return strings.TrimRight(flag, "/")
	}
	if env := os.Getenv("WHISPER_BASE_URL"); env != "" {
		return strings.TrimRight(env, "/")
	}
	return DefaultBaseURL
}

func isTerminalStdin() bool {
	fi, err := os.Stdin.Stat()
	if err != nil {
		return true
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

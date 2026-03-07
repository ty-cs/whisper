package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/whisper/whisper/internal/api"
	"github.com/whisper/whisper/internal/crypto"
	getUI "github.com/whisper/whisper/internal/ui/get"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func getCmd() *cobra.Command {
	var quiet bool
	var jsonOutput bool
	var password string

	cmd := &cobra.Command{
		Use:   "get <url>",
		Short: "Retrieve and decrypt a secret",
		Long: `Fetch an encrypted secret from the server and decrypt it locally.
The decryption key is extracted from the URL fragment (#).`,
		Example: `  whisper get https://example.com/s/abc123#7KxB9...
  whisper https://example.com/s/abc123#7KxB9...
  whisper get https://example.com/s/abc123 --password mypass --quiet`,
		Args:          cobra.ExactArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if quiet && jsonOutput {
				return fmt.Errorf("--quiet and --json are mutually exclusive")
			}
			return runGet(args[0], password, quiet, jsonOutput)
		},
	}

	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Output only the plaintext (no TUI)")
	cmd.Flags().BoolVarP(&jsonOutput, "json", "j", false, `Output JSON {"plaintext":"..."}`)
	cmd.Flags().StringVarP(&password, "password", "p", "", "Password for password-protected secrets (headless only)")

	return cmd
}

func runGet(rawURL, password string, quiet, jsonOutput bool) error {
	id, keyStr, serverURL, err := parseWhisperURL(rawURL)
	if err != nil {
		return fmt.Errorf("parsing URL: %w", err)
	}

	apiClient := api.NewClient(serverURL)

	if quiet || jsonOutput {
		return headlessGet(apiClient, id, keyStr, password, jsonOutput)
	}

	// TUI path
	m := getUI.InitialModel(apiClient, id, keyStr)
	p := tea.NewProgram(m)

	if _, err := p.Run(); err != nil {
		return fmt.Errorf("UI crashed: %w", err)
	}

	return nil
}

func headlessGet(client *api.Client, id, base58Key, password string, jsonOutput bool) error {
	resp, err := client.GetSecret(id)
	if err != nil {
		return err
	}

	var plaintext string
	if resp.HasPassword {
		if password == "" {
			return fmt.Errorf("secret is password-protected; use --password")
		}
		saltBytes, err := base64.StdEncoding.DecodeString(resp.Salt)
		if err != nil {
			return fmt.Errorf("invalid salt in payload")
		}
		keyBytes, err := crypto.DeriveKeyFromPassword(password, saltBytes)
		if err != nil {
			return fmt.Errorf("key derivation failed: %w", err)
		}
		payload := &crypto.EncryptedPayload{
			Ciphertext: resp.Ciphertext,
			IV:         resp.IV,
			Salt:       resp.Salt,
		}
		plaintext, err = crypto.Decrypt(payload, keyBytes)
		if err != nil {
			return fmt.Errorf("wrong password")
		}
	} else {
		keyBytes, err := crypto.Base58ToKey(base58Key)
		if err != nil {
			return fmt.Errorf("invalid decryption key")
		}
		payload := &crypto.EncryptedPayload{
			Ciphertext: resp.Ciphertext,
			IV:         resp.IV,
			Salt:       resp.Salt,
		}
		plaintext, err = crypto.Decrypt(payload, keyBytes)
		if err != nil {
			return fmt.Errorf("failed to decrypt (wrong or corrupted key)")
		}
	}

	if jsonOutput {
		data, _ := json.Marshal(map[string]string{"plaintext": plaintext})
		fmt.Println(string(data))
	} else {
		fmt.Println(plaintext)
	}
	return nil
}

// parseWhisperURL extracts secret ID, key, and server base URL from
// a URL like https://host/s/SECRET_ID#BASE58_KEY
func parseWhisperURL(rawURL string) (id, key, serverURL string, err error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL: %w", err)
	}

	// Extract the key from the fragment (#) — empty for password-protected secrets
	key = u.Fragment

	// Extract the ID from the path (/s/{id})
	pathParts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(pathParts) != 2 || pathParts[0] != "s" {
		return "", "", "", fmt.Errorf("invalid whisper URL — expected path /s/<id>")
	}
	id = pathParts[1]

	// Reconstruct server base URL
	u.Path = ""
	u.Fragment = ""
	u.RawFragment = ""
	serverURL = strings.TrimRight(u.String(), "/")

	return id, key, serverURL, nil
}

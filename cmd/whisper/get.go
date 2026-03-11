package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/ty-cs/whisper/internal/api"
	"github.com/ty-cs/whisper/internal/crypto"
	getUI "github.com/ty-cs/whisper/internal/ui/get"

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
		return err
	}

	if err := api.ValidateBaseURL(serverURL); err != nil {
		return err
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
			return fmt.Errorf("this secret is password-protected — run again with --password <password>")
		}
		if base58Key == "" {
			return fmt.Errorf("this secret is password-protected but the URL is missing the decryption key fragment — it may have been created with an older version of the CLI")
		}
		urlKeyBytes, err := crypto.Base58ToKey(base58Key)
		if err != nil {
			return fmt.Errorf("invalid key in URL fragment: %w", err)
		}
		keyBytes, err := crypto.DeriveKeyFromPassword(password, urlKeyBytes)
		if err != nil {
			return fmt.Errorf("key derivation failed: %w", err)
		}
		payload := &crypto.EncryptedPayload{
			Ciphertext: resp.Ciphertext,
			IV:         resp.IV,
		}
		plaintext, err = crypto.Decrypt(payload, keyBytes)
		if err != nil {
			return fmt.Errorf("wrong password — decryption failed")
		}
	} else {
		keyBytes, err := crypto.Base58ToKey(base58Key)
		if err != nil {
			return fmt.Errorf("the URL appears to be missing or has a corrupted decryption key")
		}
		payload := &crypto.EncryptedPayload{
			Ciphertext: resp.Ciphertext,
			IV:         resp.IV,
		}
		plaintext, err = crypto.Decrypt(payload, keyBytes)
		if err != nil {
			return fmt.Errorf("decryption failed — the key in the URL may be wrong or the secret corrupted")
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
		return "", "", "", fmt.Errorf("%q is not a valid URL", rawURL)
	}

	// Extract the key from the fragment (#)
	key = u.Fragment

	// Extract the ID from the path (/s/{id})
	pathParts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(pathParts) != 2 || pathParts[0] != "s" {
		return "", "", "", fmt.Errorf("%q is not a valid Whisper URL\n\nExpected: https://example.com/s/<id>#<key>", rawURL)
	}
	id = pathParts[1]

	// Reconstruct server base URL
	u.Path = ""
	u.Fragment = ""
	u.RawFragment = ""
	serverURL = strings.TrimRight(u.String(), "/")

	return id, key, serverURL, nil
}

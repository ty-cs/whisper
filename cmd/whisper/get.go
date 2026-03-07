package main

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/spf13/cobra"
	"github.com/whisper/whisper/internal/api"
	wcrypto "github.com/whisper/whisper/internal/crypto"
)

func getCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get <url>",
		Short: "Retrieve and decrypt a secret",
		Long: `Fetch an encrypted secret from the server and decrypt it locally.
The decryption key is extracted from the URL fragment (#).`,
		Example: `  whisper get https://example.com/#/s/abc123/7KxB9...
  whisper https://example.com/#/s/abc123/7KxB9...`,
		Args:          cobra.ExactArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runGet(args[0])
		},
	}

	return cmd
}

func runGet(rawURL string) error {
	// Parse the whisper URL
	id, keyStr, serverURL, err := parseWhisperURL(rawURL)
	if err != nil {
		return fmt.Errorf("parsing URL: %w", err)
	}

	// Decode the Base58 key
	key, err := wcrypto.Base58ToKey(keyStr)
	if err != nil {
		return fmt.Errorf("decoding key: %w", err)
	}

	// Fetch ciphertext from server
	client := api.NewClient(serverURL)
	resp, err := client.GetSecret(id)
	if err != nil {
		return err
	}

	// Decrypt locally
	plaintext, err := wcrypto.Decrypt(&wcrypto.EncryptedPayload{
		Ciphertext: resp.Ciphertext,
		IV:         resp.IV,
		Salt:       resp.Salt,
	}, key)
	if err != nil {
		return fmt.Errorf("decrypting: %w", err)
	}

	// Output
	if isTerminal() {
		fmt.Println()
		fmt.Println("  🔓 Decrypted secret:")
		fmt.Println()
		fmt.Printf("  %s\n", plaintext)
		fmt.Println()
		if resp.BurnAfterReading {
			fmt.Println("  🔥 This secret has been destroyed")
		}
	} else {
		fmt.Print(plaintext)
	}

	return nil
}

// parseWhisperURL extracts secret ID, key, and server base URL from
// a URL like https://host/#/s/SECRET_ID/BASE58_KEY
func parseWhisperURL(rawURL string) (id, key, serverURL string, err error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL: %w", err)
	}

	fragment := u.Fragment // "/s/abc123/7KxB9..."
	parts := strings.Split(strings.Trim(fragment, "/"), "/")

	if len(parts) != 3 || parts[0] != "s" {
		return "", "", "", fmt.Errorf("invalid whisper URL — expected #/s/<id>/<key>")
	}

	id = parts[1]
	key = parts[2]

	// Reconstruct server base URL
	u.Fragment = ""
	u.RawFragment = ""
	serverURL = strings.TrimRight(u.String(), "/")

	return id, key, serverURL, nil
}

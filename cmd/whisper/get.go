package main

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/whisper/whisper/internal/api"
	getUI "github.com/whisper/whisper/internal/ui/get"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
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
	// 1. Parse the whisper URL
	id, keyStr, serverURL, err := parseWhisperURL(rawURL)
	if err != nil {
		return fmt.Errorf("parsing URL: %w", err)
	}

	// 2. Initialize API Client
	apiClient := api.NewClient(serverURL)

	// 3. Launch the Bubbletea UI
	m := getUI.InitialModel(apiClient, id, keyStr)
	p := tea.NewProgram(m)

	if _, err := p.Run(); err != nil {
		return fmt.Errorf("UI crashed: %w", err)
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

	// Extract the key from the fragment (#)
	key = u.Fragment
	if key == "" {
		return "", "", "", fmt.Errorf("invalid whisper URL — missing decryption key in fragment (#)")
	}

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

package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/whisper/whisper/internal/api"
	createUI "github.com/whisper/whisper/internal/ui/create"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func createCmd() *cobra.Command {
	var server string

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create an encrypted secret",
		Long: `Open an interactive UI to type and encrypt a secret locally before uploading.
Returns a shareable URL containing the decryption key.

Reads from stdin if piped, skipping the typing interface.`,
		Example: `  whisper create
  echo "my secret" | whisper create
  cat credentials.txt | whisper create`,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runCreate(server)
		},
	}

	cmd.Flags().StringVarP(&server, "server", "s", "", "API server URL")

	return cmd
}

func runCreate(server string) error {
	baseURL := resolveServer(server)

	// Read secret text if it was piped in
	initialText := readPipedSecret()

	// Initialize API Client
	apiClient := api.NewClient(baseURL)

	// Launch the Bubbletea UI
	m := createUI.InitialModel(apiClient, initialText)
	p := tea.NewProgram(m)

	if _, err := p.Run(); err != nil {
		return fmt.Errorf("UI crashed: %w", err)
	}

	return nil
}

// readPipedSecret reads from stdin only if data was piped in.
func readPipedSecret() string {
	if !isTerminalStdin() {
		// Pipe mode: read all of stdin
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 0, 512*1024), 512*1024) // 512KB max
		var lines []string
		for scanner.Scan() {
			lines = append(lines, scanner.Text())
		}
		return strings.Join(lines, "\n")
	}
	// Interactive mode: return empty string so TUI textarea is blank
	return ""
}

func resolveServer(flag string) string {
	if flag != "" {
		return strings.TrimRight(flag, "/")
	}
	if env := os.Getenv("WHISPER_API_URL"); env != "" {
		return strings.TrimRight(env, "/")
	}
	return DefaultAPIURL // Set in main.go
}

func isTerminalStdin() bool {
	fi, err := os.Stdin.Stat()
	if err != nil {
		return true
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

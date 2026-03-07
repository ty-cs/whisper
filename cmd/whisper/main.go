// Whisper CLI — anonymous E2EE secret sharing from the command line.
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var version = "1.0.0"

// DefaultAPIURL points to the globally deployed Vercel instance.
var DefaultAPIURL = "https://whisper-core.vercel.app"

func main() {
	// Allow overriding the API URL for local testing
	if envURL := os.Getenv("WHISPER_API_URL"); envURL != "" {
		DefaultAPIURL = envURL
	}

	root := &cobra.Command{
		Use:   "whisper",
		Short: "Anonymous E2EE secret sharing",
		Long: `whisper — share secrets anonymously with end-to-end encryption.

Secrets are encrypted locally before upload. The server never sees
your plaintext. The decryption key lives in the URL fragment (#),
which browsers and servers never transmit.`,
		// If a URL is passed as the first arg, treat it as "get"
		Args: cobra.ArbitraryArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 1 && isURL(args[0]) {
				return runGet(args[0])
			}
			return cmd.Help()
		},
	}

	root.AddCommand(createCmd())
	root.AddCommand(getCmd())
	root.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("whisper v%s\n", version)
		},
	})

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func isURL(s string) bool {
	return len(s) > 8 && (s[:7] == "http://" || s[:8] == "https://")
}

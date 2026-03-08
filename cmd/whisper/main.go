// Whisper CLI — anonymous E2EE secret sharing from the command line.
package main

import (
	"fmt"
	"os"
	"runtime/debug"
	"strings"

	"github.com/spf13/cobra"
)

// version is set at build time via -ldflags "-X main.version=x.y.z".
// Falls back to module build info (go install), then "dev".
var version = ""

func resolveVersion() string {
	if version != "" {
		return strings.TrimPrefix(version, "v")
	}
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
		return strings.TrimPrefix(info.Main.Version, "v")
	}
	return "dev"
}

// DefaultAPIURL is the fallback server when no --server flag or WHISPER_API_URL env var is set.
var DefaultAPIURL = "http://localhost:3000"

func main() {
	root := &cobra.Command{
		Use:     "whisper",
		Version: "v" + resolveVersion(),
		Short:   "Anonymous E2EE secret sharing",
		Long: `whisper — share secrets anonymously with end-to-end encryption.

Secrets are encrypted locally before upload. The server never sees
your plaintext. The decryption key lives in the URL fragment (#),
which browsers and servers never transmit.`,
		// If a URL is passed as the first arg, treat it as "get"
		Args: cobra.ArbitraryArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 1 && isURL(args[0]) {
				return runGet(args[0], "", false, false)
			}
			return cmd.Help()
		},
	}

	root.AddCommand(createCmd())
	root.AddCommand(getCmd())
	root.AddCommand(deleteCmd())
	root.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("whisper v%s\n", resolveVersion())
		},
	})

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func isURL(s string) bool {
	return len(s) > 8 && (s[:7] == "http://" || s[:8] == "https://")
}

package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/whisper/whisper/internal/api"
	wcrypto "github.com/whisper/whisper/internal/crypto"
)

func createCmd() *cobra.Command {
	var (
		expire string
		burn   bool
		server string
	)

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create an encrypted secret",
		Long: `Encrypt text locally and upload the ciphertext to the server.
Returns a shareable URL containing the decryption key.

Reads from stdin if piped, or prompts interactively.`,
		Example: `  echo "my secret" | whisper create --burn
  whisper create --expire 1h
  cat credentials.txt | whisper create -e 7d -b`,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runCreate(server, expire, burn)
		},
	}

	cmd.Flags().StringVarP(&expire, "expire", "e", "24h", "Expiry duration: 5m, 1h, 24h, 7d, 30d")
	cmd.Flags().BoolVarP(&burn, "burn", "b", false, "Burn after reading (delete on first view)")
	cmd.Flags().StringVarP(&server, "server", "s", "", "API server URL (default: $WHISPER_URL or localhost:3000)")

	return cmd
}

func runCreate(server, expire string, burn bool) error {
	baseURL := resolveServer(server)

	// Read secret text
	secret := readSecret()
	if strings.TrimSpace(secret) == "" {
		return fmt.Errorf("no secret provided — type your secret or pipe it in")
	}

	// Generate encryption key
	key, err := wcrypto.GenerateKey()
	if err != nil {
		return fmt.Errorf("generating key: %w", err)
	}

	// Encrypt locally
	payload, err := wcrypto.Encrypt(secret, key)
	if err != nil {
		return fmt.Errorf("encrypting: %w", err)
	}

	// Upload ciphertext to server
	client := api.NewClient(baseURL)
	resp, err := client.CreateSecret(&api.CreateRequest{
		Ciphertext:       payload.Ciphertext,
		IV:               payload.IV,
		Salt:             payload.Salt,
		ExpiresIn:        expire,
		BurnAfterReading: burn,
	})
	if err != nil {
		return fmt.Errorf("uploading: %w", err)
	}

	// Build shareable URL — key goes in #fragment (never sent to server)
	keyStr := wcrypto.KeyToBase58(key)
	shareURL := fmt.Sprintf("%s/#/s/%s/%s", baseURL, resp.ID, keyStr)

	if isTerminal() {
		fmt.Println()
		fmt.Println("  🔗 Secret created!")
		fmt.Println()
		fmt.Printf("  %s\n", shareURL)
		fmt.Println()
		if burn {
			fmt.Println("  ⚠️  This secret will be destroyed after first view")
		}
		fmt.Printf("  ⏳ Expires in: %s\n", expire)
		fmt.Println()
	} else {
		fmt.Println(shareURL)
	}

	return nil
}

// readSecret reads from stdin — piped or interactive.
func readSecret() string {
	if !isTerminal() {
		// Pipe mode: read all of stdin
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 0, 512*1024), 512*1024) // 512KB max
		var lines []string
		for scanner.Scan() {
			lines = append(lines, scanner.Text())
		}
		return strings.Join(lines, "\n")
	}

	// Interactive mode
	fmt.Print("  Enter your secret (press Enter on empty line to finish):\n\n")
	scanner := bufio.NewScanner(os.Stdin)
	var lines []string

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" && len(lines) > 0 {
			break
		}
		if line != "" {
			lines = append(lines, line)
		}
	}

	return strings.Join(lines, "\n")
}

func resolveServer(flag string) string {
	if flag != "" {
		return strings.TrimRight(flag, "/")
	}
	if env := os.Getenv("WHISPER_URL"); env != "" {
		return strings.TrimRight(env, "/")
	}
	return "http://localhost:3000"
}

func isTerminal() bool {
	fi, err := os.Stdout.Stat()
	if err != nil {
		return true
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

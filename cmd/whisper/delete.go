package main

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/whisper/whisper/internal/api"
)

func deleteCmd() *cobra.Command {
	var server string

	cmd := &cobra.Command{
		Use:           "delete <url>",
		Short:         "Delete an encrypted secret",
		Args:          cobra.ExactArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			id, _, serverURL, err := parseWhisperURL(args[0])
			if err != nil {
				return fmt.Errorf("parsing URL: %w", err)
			}

			// --server flag overrides the URL's host
			if server != "" {
				serverURL = resolveServer(server)
			}

			client := api.NewClient(serverURL)
			if err := client.DeleteSecret(id); err != nil {
				return err
			}

			fmt.Println("Secret deleted.")
			return nil
		},
	}

	cmd.Flags().StringVarP(&server, "server", "s", "", "API server URL")

	return cmd
}

package main

import (
	"strings"
	"testing"
)

func TestRunCreateFlagValidation(t *testing.T) {
	tests := []struct {
		name            string
		args            []string
		wantErrContains string
	}{
		{
			name:            "--quiet and --json are mutually exclusive",
			args:            []string{"--quiet", "--json", "--text", "hello"},
			wantErrContains: "mutually exclusive",
		},
		{
			name:            "invalid --expires value",
			args:            []string{"--expires", "99h", "--quiet", "--text", "hello"},
			wantErrContains: "invalid --expires value",
		},
		{
			name:            "multiple input sources: --text and --file",
			args:            []string{"--text", "hello", "--file", "/tmp/whisper-test-input", "--quiet"},
			wantErrContains: "multiple input sources",
		},
		{
			name:            "headless with no input",
			args:            []string{"--quiet"},
			wantErrContains: "input required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd := createCmd()
			cmd.SetArgs(tt.args)
			err := cmd.Execute()
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), tt.wantErrContains) {
				t.Errorf("error %q does not contain %q", err.Error(), tt.wantErrContains)
			}
		})
	}
}

func TestResolveServer(t *testing.T) {
	originalDefault := DefaultAPIURL
	t.Cleanup(func() { DefaultAPIURL = originalDefault })

	DefaultAPIURL = "https://default.example.com"

	tests := []struct {
		name   string
		flag   string
		envVar string
		want   string
	}{
		{
			name:   "flag takes priority over env and default",
			flag:   "https://flag.example.com",
			envVar: "https://env.example.com",
			want:   "https://flag.example.com",
		},
		{
			name: "flag with trailing slash is trimmed",
			flag: "https://flag.example.com/",
			want: "https://flag.example.com",
		},
		{
			name:   "env var used when no flag",
			envVar: "https://env.example.com",
			want:   "https://env.example.com",
		},
		{
			name:   "env var with trailing slash is trimmed",
			envVar: "https://env.example.com/",
			want:   "https://env.example.com",
		},
		{
			name: "default used when neither flag nor env set",
			want: "https://default.example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVar != "" {
				t.Setenv("WHISPER_API_URL", tt.envVar)
			} else {
				t.Setenv("WHISPER_API_URL", "")
			}

			got := resolveServer(tt.flag)
			if got != tt.want {
				t.Errorf("resolveServer(%q) with env=%q = %q, want %q", tt.flag, tt.envVar, got, tt.want)
			}
		})
	}
}

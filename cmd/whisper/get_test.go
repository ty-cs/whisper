package main

import "testing"

func TestParseWhisperURL(t *testing.T) {
	tests := []struct {
		name      string
		rawURL    string
		wantID    string
		wantKey   string
		wantServer string
		wantErr   bool
	}{
		{
			name:       "valid URL",
			rawURL:     "https://example.com/s/abc123#BASE58KEY",
			wantID:     "abc123",
			wantKey:    "BASE58KEY",
			wantServer: "https://example.com",
		},
		{
			name:       "valid URL with port",
			rawURL:     "http://localhost:3000/s/xyz789#MYKEY",
			wantID:     "xyz789",
			wantKey:    "MYKEY",
			wantServer: "http://localhost:3000",
		},
		{
			name:       "missing fragment (password-protected secret)",
			rawURL:     "https://example.com/s/abc123",
			wantID:     "abc123",
			wantKey:    "",
			wantServer: "https://example.com",
		},
		{
			name:    "wrong path — no /s/ prefix",
			rawURL:  "https://example.com/secrets/abc123#KEY",
			wantErr: true,
		},
		{
			name:    "wrong path — too many segments",
			rawURL:  "https://example.com/s/abc123/extra#KEY",
			wantErr: true,
		},
		{
			name:    "wrong path — only one segment",
			rawURL:  "https://example.com/abc123#KEY",
			wantErr: true,
		},
		{
			name:    "invalid URL",
			rawURL:  "://bad-url",
			wantErr: true,
		},
		{
			name:    "empty string",
			rawURL:  "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, key, server, err := parseWhisperURL(tt.rawURL)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got id=%q key=%q server=%q", id, key, server)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if id != tt.wantID {
				t.Errorf("id: got %q, want %q", id, tt.wantID)
			}
			if key != tt.wantKey {
				t.Errorf("key: got %q, want %q", key, tt.wantKey)
			}
			if server != tt.wantServer {
				t.Errorf("server: got %q, want %q", server, tt.wantServer)
			}
		})
	}
}

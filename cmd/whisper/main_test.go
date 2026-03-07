package main

import "testing"

func TestIsURL(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"https://example.com", true},
		{"http://localhost:3000", true},
		{"https://whisper.app/#/s/abc123/KEY", true},
		{"ftp://example.com", false},
		{"not-a-url", false},
		{"http:/", false},
		{"", false},
		{"https:/", false},
	}

	for _, tt := range tests {
		got := isURL(tt.input)
		if got != tt.want {
			t.Errorf("isURL(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

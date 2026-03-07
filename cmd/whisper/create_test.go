package main

import "testing"

func TestResolveServer(t *testing.T) {
	originalDefault := DefaultAPIURL
	t.Cleanup(func() { DefaultAPIURL = originalDefault })

	DefaultAPIURL = "https://default.example.com"

	tests := []struct {
		name    string
		flag    string
		envVar  string
		want    string
	}{
		{
			name: "flag takes priority over env and default",
			flag: "https://flag.example.com",
			envVar: "https://env.example.com",
			want: "https://flag.example.com",
		},
		{
			name:   "flag with trailing slash is trimmed",
			flag:   "https://flag.example.com/",
			want:   "https://flag.example.com",
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

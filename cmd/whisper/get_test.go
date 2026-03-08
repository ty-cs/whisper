package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ty-cs/whisper/internal/api"
	"github.com/ty-cs/whisper/internal/crypto"
)

func TestParseWhisperURL(t *testing.T) {
	tests := []struct {
		name            string
		rawURL          string
		wantID          string
		wantKey         string
		wantServer      string
		wantErr         bool
		wantErrContains string
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
			name:       "URL without fragment",
			rawURL:     "https://example.com/s/abc123",
			wantID:     "abc123",
			wantKey:    "",
			wantServer: "https://example.com",
		},
		{
			name:            "plain word — not a URL",
			rawURL:          "test",
			wantErr:         true,
			wantErrContains: `"test" is not a valid Whisper URL`,
		},
		{
			name:            "wrong path — no /s/ prefix",
			rawURL:          "https://example.com/secrets/abc123#KEY",
			wantErr:         true,
			wantErrContains: "is not a valid Whisper URL",
		},
		{
			name:            "wrong path — too many segments",
			rawURL:          "https://example.com/s/abc123/extra#KEY",
			wantErr:         true,
			wantErrContains: "is not a valid Whisper URL",
		},
		{
			name:            "wrong path — only one segment",
			rawURL:          "https://example.com/abc123#KEY",
			wantErr:         true,
			wantErrContains: "is not a valid Whisper URL",
		},
		{
			name:            "empty string",
			rawURL:          "",
			wantErr:         true,
			wantErrContains: "is not a valid Whisper URL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, key, server, err := parseWhisperURL(tt.rawURL)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got id=%q key=%q server=%q", id, key, server)
				}
				if tt.wantErrContains != "" && !strings.Contains(err.Error(), tt.wantErrContains) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.wantErrContains)
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

func TestHeadlessGetErrors(t *testing.T) {
	t.Run("password-protected with no --password flag", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(api.GetResponse{HasPassword: true})
		}))
		defer srv.Close()

		err := headlessGet(api.NewClient(srv.URL), "id", "", "", false)
		assertErrContains(t, err, "password-protected")
	})

	t.Run("wrong password", func(t *testing.T) {
		// Encrypt a real secret using ZK model (urlKey as PBKDF2 salt)
		urlKey, _ := crypto.GenerateKey()
		key, _ := crypto.DeriveKeyFromPassword("correct", urlKey)
		payload, _ := crypto.Encrypt("hello", key)
		base58Key := crypto.KeyToBase58(urlKey)

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(api.GetResponse{
				HasPassword: true,
				Ciphertext:  payload.Ciphertext,
				IV:          payload.IV,
			})
		}))
		defer srv.Close()

		err := headlessGet(api.NewClient(srv.URL), "id", base58Key, "wrong", false)
		assertErrContains(t, err, "wrong password")
	})

	t.Run("password-protected with no fragment", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(api.GetResponse{HasPassword: true})
		}))
		defer srv.Close()

		err := headlessGet(api.NewClient(srv.URL), "id", "", "somepass", false)
		assertErrContains(t, err, "missing the decryption key fragment")
	})

	t.Run("corrupted key in URL", func(t *testing.T) {
		keyBytes, _ := crypto.GenerateKey()
		payload, _ := crypto.Encrypt("hello", keyBytes)

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(api.GetResponse{
				Ciphertext: payload.Ciphertext,
				IV:         payload.IV,
			})
		}))
		defer srv.Close()

		err := headlessGet(api.NewClient(srv.URL), "id", "!invalid-base58!", "", false)
		assertErrContains(t, err, "corrupted decryption key")
	})
}

func assertErrContains(t *testing.T, err error, substr string) {
	t.Helper()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), substr) {
		t.Errorf("error %q does not contain %q", err.Error(), substr)
	}
}

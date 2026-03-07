package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetSecretErrorMessages(t *testing.T) {
	tests := []struct {
		name            string
		handler         http.HandlerFunc
		wantErrContains string
	}{
		{
			name: "404 returns friendly not-found message",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNotFound)
			},
			wantErrContains: "secret not found",
		},
		{
			name: "500 returns server error message",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(`{"error":"internal server error"}`))
			},
			wantErrContains: "server error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(tt.handler)
			defer srv.Close()

			_, err := NewClient(srv.URL).GetSecret("test-id")
			assertErrContains(t, err, tt.wantErrContains)
		})
	}
}

func TestGetSecretNetworkError(t *testing.T) {
	// Close the server immediately so the request fails with connection refused
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close()

	_, err := NewClient(srv.URL).GetSecret("test-id")
	assertErrContains(t, err, "could not reach the server")
}

func TestDeleteSecretErrorMessages(t *testing.T) {
	tests := []struct {
		name            string
		handler         http.HandlerFunc
		wantErrContains string
	}{
		{
			name: "404 returns friendly not-found message",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNotFound)
			},
			wantErrContains: "secret not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(tt.handler)
			defer srv.Close()

			err := NewClient(srv.URL).DeleteSecret("test-id")
			assertErrContains(t, err, tt.wantErrContains)
		})
	}
}

func TestDeleteSecretNetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close()

	err := NewClient(srv.URL).DeleteSecret("test-id")
	assertErrContains(t, err, "could not reach the server")
}

func TestCreateSecretErrorMessages(t *testing.T) {
	tests := []struct {
		name            string
		handler         http.HandlerFunc
		wantErrContains string
	}{
		{
			name: "400 surfaces validation message",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error":"expiresIn is required"}`))
			},
			wantErrContains: "invalid request",
		},
		{
			name: "429 returns rate-limited message",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusTooManyRequests)
			},
			wantErrContains: "rate limited",
		},
		{
			name: "500 returns upload-failed message",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusInternalServerError)
			},
			wantErrContains: "upload failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(tt.handler)
			defer srv.Close()

			_, err := NewClient(srv.URL).CreateSecret(&CreateRequest{
				Ciphertext: "abc",
				IV:         "def",
				Salt:       "ghi",
				ExpiresIn:  "24h",
			})
			assertErrContains(t, err, tt.wantErrContains)
		})
	}
}

func TestCreateSecretNetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close()

	_, err := NewClient(srv.URL).CreateSecret(&CreateRequest{
		Ciphertext: "abc",
		IV:         "def",
		Salt:       "ghi",
		ExpiresIn:  "24h",
	})
	assertErrContains(t, err, "could not reach the server")
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

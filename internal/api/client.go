// Package api provides the HTTP client for the Whisper API.
package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client talks to the Whisper API server.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// NewClient creates an API client pointing at the given base URL.
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// CreateRequest is the body sent to POST /api/secrets.
type CreateRequest struct {
	Ciphertext       string `json:"ciphertext"`
	IV               string `json:"iv"`
	Salt             string `json:"salt"`
	ExpiresIn        string `json:"expiresIn"`
	BurnAfterReading bool   `json:"burnAfterReading,omitempty"`
	MaxViews         int    `json:"maxViews,omitempty"`
	HasPassword      bool   `json:"hasPassword,omitempty"`
}

// CreateResponse is returned from POST /api/secrets.
type CreateResponse struct {
	Code             int    `json:"code"`
	ID               string `json:"id"`
	ExpiresAt        int64  `json:"expiresAt"`
	BurnAfterReading bool   `json:"burnAfterReading"`
}

// GetResponse is returned from GET /api/secrets/:id.
type GetResponse struct {
	Code             int    `json:"code"`
	Ciphertext       string `json:"ciphertext"`
	IV               string `json:"iv"`
	Salt             string `json:"salt"`
	BurnAfterReading bool   `json:"burnAfterReading"`
	HasPassword      bool   `json:"hasPassword"`
	ExpiresAt        int64  `json:"expiresAt"` // unix seconds
	MaxViews         int    `json:"maxViews"`  // 0 = unlimited
	ViewCount        int    `json:"viewCount"` // views consumed so far (including this one)
}

// ErrorResponse is returned on API errors.
type ErrorResponse struct {
	Code  int    `json:"code"`
	Error string `json:"error"`
}

// CreateSecret uploads an encrypted secret to the server.
func (c *Client) CreateSecret(req *CreateRequest) (*CreateResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	resp, err := c.HTTPClient.Post(
		c.BaseURL+"/api/secrets",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("could not reach the server at %s — check the address and your internet connection", c.BaseURL)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != 201 {
		var errResp ErrorResponse
		json.Unmarshal(respBody, &errResp)
		switch resp.StatusCode {
		case 400:
			switch errResp.Code {
			case ErrorCodeInvalidExpiry:
				return nil, fmt.Errorf("invalid expiry: %s", errResp.Error)
			case ErrorCodeConflictingOptions:
				return nil, fmt.Errorf("conflicting options: %s", errResp.Error)
			case ErrorCodeMaxViewsExceeded:
				return nil, fmt.Errorf("invalid max views: %s", errResp.Error)
			default:
				return nil, fmt.Errorf("invalid request: %s", errResp.Error)
			}
		case 413:
			return nil, fmt.Errorf("payload too large — maximum 1 MB")
		case 429:
			return nil, fmt.Errorf("rate limited — please wait before creating another secret")
		default:
			return nil, fmt.Errorf("upload failed — server returned %d", resp.StatusCode)
		}
	}

	var result CreateResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// DeleteResponse is returned from DELETE /api/secrets/:id.
type DeleteResponse struct {
	Code    int  `json:"code"`
	Deleted bool `json:"deleted"`
}

// DeleteSecret deletes a secret by ID from the server.
func (c *Client) DeleteSecret(id string) error {
	req, err := http.NewRequest(http.MethodDelete, c.BaseURL+"/api/secrets/"+id, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach the server at %s — check the address and your internet connection", c.BaseURL)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 204 {
		switch resp.StatusCode {
		case 404:
			return fmt.Errorf("secret not found — it may have already been deleted or expired")
		default:
			return fmt.Errorf("delete failed — server returned %d", resp.StatusCode)
		}
	}

	return nil
}

// GetSecret retrieves an encrypted secret from the server.
func (c *Client) GetSecret(id string) (*GetResponse, error) {
	resp, err := c.HTTPClient.Get(c.BaseURL + "/api/secrets/" + id)
	if err != nil {
		return nil, fmt.Errorf("could not reach the server at %s — check the address and your internet connection", c.BaseURL)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != 200 {
		switch resp.StatusCode {
		case 404:
			return nil, fmt.Errorf("secret not found — it may have expired or already been read")
		default:
			var errResp ErrorResponse
			json.Unmarshal(respBody, &errResp)
			return nil, fmt.Errorf("server error (%d): %s", resp.StatusCode, errResp.Error)
		}
	}

	var result GetResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// Package crypto provides AES-256-GCM encryption/decryption and Base58 key encoding.
// This is the Go equivalent of @whisper/crypto — same algorithm, interoperable output.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"

	"golang.org/x/crypto/pbkdf2"
)

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// EncryptedPayload holds the encrypted secret data, all fields base64-encoded.
type EncryptedPayload struct {
	Ciphertext string `json:"ciphertext"`
	IV         string `json:"iv"`
}

// WhisperPayload is the decrypted content of a Whisper secret.
// Type is "text" or "file".
type WhisperPayload struct {
	Type     string // "text" or "file"
	Text     string // non-empty for type=text
	Name     string // filename for type=file
	MimeType string // MIME type for type=file
	Data     []byte // raw file bytes for type=file
}

// whisperEnvelope is the JSON structure encrypted inside the ciphertext.
type whisperEnvelope struct {
	W    int    `json:"__w"`
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	Name string `json:"name,omitempty"`
	Mime string `json:"mime,omitempty"`
	Data string `json:"data,omitempty"` // base64-encoded file bytes
}

// GenerateKey creates a cryptographically random 256-bit key.
func GenerateKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	return key, nil
}

// Encrypt encrypts plaintext using AES-256-GCM.
// Returns the ciphertext and IV as base64-encoded strings.
func Encrypt(plaintext string, key []byte) (*EncryptedPayload, error) {
	if len(key) != 32 {
		return nil, errors.New("key must be 32 bytes (256 bits)")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	// 12-byte IV (nonce) for GCM — matches the JS WebCrypto implementation
	iv := make([]byte, 12)
	if _, err := rand.Read(iv); err != nil {
		return nil, err
	}

	ciphertext := gcm.Seal(nil, iv, []byte(plaintext), nil)

	return &EncryptedPayload{
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
		IV:         base64.StdEncoding.EncodeToString(iv),
	}, nil
}

// DeriveKeyFromPassword derives a 32-byte AES key from a password and salt using
// PBKDF2-SHA256 with 600,000 iterations — interoperable with @whisper/crypto.
func DeriveKeyFromPassword(password string, salt []byte) ([]byte, error) {
	key := pbkdf2.Key([]byte(password), salt, 600_000, 32, sha256.New)
	return key, nil
}

// EncryptWithKey encrypts plaintext using AES-256-GCM with a provided key.
// Equivalent to Encrypt but accepts the key as a parameter rather than generating one.
func EncryptWithKey(plaintext string, key []byte) (*EncryptedPayload, error) {
	return Encrypt(plaintext, key)
}

// EncryptPayload encrypts a WhisperPayload into the structured envelope format.
// Interoperable with @whisper/crypto's encryptPayload.
func EncryptPayload(payload *WhisperPayload, key []byte) (*EncryptedPayload, error) {
	if payload == nil {
		return nil, errors.New("payload must not be nil")
	}
	env := whisperEnvelope{W: 1, Type: payload.Type}
	switch payload.Type {
	case "text":
		env.Text = payload.Text
	case "file":
		env.Name = payload.Name
		env.Mime = payload.MimeType
		env.Data = base64.StdEncoding.EncodeToString(payload.Data)
	default:
		return nil, errors.New("unknown payload type: " + payload.Type)
	}

	jsonBytes, err := json.Marshal(env)
	if err != nil {
		return nil, err
	}
	return Encrypt(string(jsonBytes), key)
}

// DecryptPayload decrypts an EncryptedPayload and parses the WhisperPayload envelope.
// Legacy secrets (no __w key) are returned as text payloads for backward compatibility.
func DecryptPayload(encrypted *EncryptedPayload, key []byte) (*WhisperPayload, error) {
	plaintext, err := Decrypt(encrypted, key)
	if err != nil {
		return nil, err
	}

	var env whisperEnvelope
	if jsonErr := json.Unmarshal([]byte(plaintext), &env); jsonErr != nil || env.W != 1 {
		return &WhisperPayload{Type: "text", Text: plaintext}, nil
	}

	switch env.Type {
	case "file":
		data, err := base64.StdEncoding.DecodeString(env.Data)
		if err != nil {
			return nil, errors.New("invalid file data encoding in envelope")
		}
		mimeType := env.Mime
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		name := env.Name
		if name == "" {
			name = "file"
		}
		return &WhisperPayload{
			Type:     "file",
			Name:     name,
			MimeType: mimeType,
			Data:     data,
		}, nil
	default:
		return &WhisperPayload{Type: "text", Text: env.Text}, nil
	}
}

// Decrypt decrypts an AES-256-GCM encrypted payload.
func Decrypt(payload *EncryptedPayload, key []byte) (string, error) {
	if len(key) != 32 {
		return "", errors.New("key must be 32 bytes (256 bits)")
	}

	ciphertext, err := base64.StdEncoding.DecodeString(payload.Ciphertext)
	if err != nil {
		return "", errors.New("invalid ciphertext encoding")
	}

	iv, err := base64.StdEncoding.DecodeString(payload.IV)
	if err != nil {
		return "", errors.New("invalid IV encoding")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return "", errors.New("decryption failed — wrong key or corrupted data")
	}

	return string(plaintext), nil
}

// KeyToBase58 encodes a byte slice to a Base58 string (Bitcoin-style alphabet).
// This is URL-safe and avoids ambiguous characters.
func KeyToBase58(key []byte) string {
	// Count leading zero bytes
	zeros := 0
	for _, b := range key {
		if b == 0 {
			zeros++
		} else {
			break
		}
	}

	// Convert to big integer
	num := new(big.Int).SetBytes(key)
	base := big.NewInt(58)
	mod := new(big.Int)
	result := make([]byte, 0, len(key)*2)

	for num.Sign() > 0 {
		num.DivMod(num, base, mod)
		result = append(result, base58Alphabet[mod.Int64()])
	}

	// Reverse
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	// Add leading '1's for zero bytes
	prefix := make([]byte, zeros)
	for i := range prefix {
		prefix[i] = '1'
	}

	return string(prefix) + string(result)
}

// Base58ToKey decodes a Base58 string back to a byte slice.
func Base58ToKey(s string) ([]byte, error) {
	// Count leading '1's
	zeros := 0
	for _, c := range s {
		if c == '1' {
			zeros++
		} else {
			break
		}
	}

	// Convert from base58 to big integer
	num := new(big.Int)
	base := big.NewInt(58)

	for _, c := range s {
		idx := -1
		for i, a := range base58Alphabet {
			if byte(a) == byte(c) {
				idx = i
				break
			}
		}
		if idx == -1 {
			return nil, errors.New("invalid base58 character")
		}
		num.Mul(num, base)
		num.Add(num, big.NewInt(int64(idx)))
	}

	// Convert to bytes
	bytes := num.Bytes()

	// Prepend leading zero bytes
	result := make([]byte, zeros+len(bytes))
	copy(result[zeros:], bytes)

	return result, nil
}

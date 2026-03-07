// Package crypto provides AES-256-GCM encryption/decryption and Base58 key encoding.
// This is the Go equivalent of @whisper/crypto — same algorithm, interoperable output.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"math/big"
)

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// EncryptedPayload holds the encrypted secret data, all fields base64-encoded.
type EncryptedPayload struct {
	Ciphertext string `json:"ciphertext"`
	IV         string `json:"iv"`
	Salt       string `json:"salt"`
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
// Returns the ciphertext, IV, and salt as base64-encoded strings.
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

	// 16-byte salt (for future password-based key derivation)
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}

	ciphertext := gcm.Seal(nil, iv, []byte(plaintext), nil)

	return &EncryptedPayload{
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
		IV:         base64.StdEncoding.EncodeToString(iv),
		Salt:       base64.StdEncoding.EncodeToString(salt),
	}, nil
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

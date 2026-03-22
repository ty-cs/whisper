package crypto

import (
	"bytes"
	"testing"
)

func TestEncryptDecryptRoundtrip(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}

	plaintext := "Hello, this is a secret message!"

	payload, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if payload.Ciphertext == "" || payload.IV == "" {
		t.Fatal("Encrypted payload has empty fields")
	}

	decrypted, err := Decrypt(payload, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("Decrypt mismatch: got %q, want %q", decrypted, plaintext)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1, _ := GenerateKey()
	key2, _ := GenerateKey()

	payload, err := Encrypt("secret", key1)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	_, err = Decrypt(payload, key2)
	if err == nil {
		t.Fatal("Expected decryption to fail with wrong key")
	}
}

func TestBase58Roundtrip(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}

	encoded := KeyToBase58(key)
	if encoded == "" {
		t.Fatal("Base58 encoding produced empty string")
	}

	decoded, err := Base58ToKey(encoded)
	if err != nil {
		t.Fatalf("Base58 decoding failed: %v", err)
	}

	if len(decoded) != len(key) {
		t.Fatalf("Decoded key length mismatch: got %d, want %d", len(decoded), len(key))
	}

	for i := range key {
		if decoded[i] != key[i] {
			t.Fatalf("Decoded key mismatch at byte %d: got %d, want %d", i, decoded[i], key[i])
		}
	}
}

func TestEncryptEmptyString(t *testing.T) {
	key, _ := GenerateKey()

	payload, err := Encrypt("", key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	decrypted, err := Decrypt(payload, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if decrypted != "" {
		t.Errorf("Expected empty string, got %q", decrypted)
	}
}

func TestInvalidKeyLength(t *testing.T) {
	shortKey := make([]byte, 16)
	_, err := Encrypt("test", shortKey)
	if err == nil {
		t.Fatal("Expected error for short key")
	}
}

func TestEncryptDecryptPayloadText(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}

	original := &WhisperPayload{Type: "text", Text: "hello world"}
	encrypted, err := EncryptPayload(original, key)
	if err != nil {
		t.Fatalf("EncryptPayload failed: %v", err)
	}

	result, err := DecryptPayload(encrypted, key)
	if err != nil {
		t.Fatalf("DecryptPayload failed: %v", err)
	}

	if result.Type != "text" || result.Text != "hello world" {
		t.Errorf("unexpected result: %+v", result)
	}
}

func TestEncryptDecryptPayloadFile(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}

	data := []byte{1, 2, 3, 255, 0, 128}
	original := &WhisperPayload{
		Type:     "file",
		Name:     "test.bin",
		MimeType: "application/octet-stream",
		Data:     data,
	}
	encrypted, err := EncryptPayload(original, key)
	if err != nil {
		t.Fatalf("EncryptPayload failed: %v", err)
	}

	result, err := DecryptPayload(encrypted, key)
	if err != nil {
		t.Fatalf("DecryptPayload failed: %v", err)
	}

	if result.Type != "file" {
		t.Fatalf("expected type=file, got %q", result.Type)
	}
	if result.Name != "test.bin" {
		t.Errorf("expected name=test.bin, got %q", result.Name)
	}
	if result.MimeType != "application/octet-stream" {
		t.Errorf("expected mime=application/octet-stream, got %q", result.MimeType)
	}
	if !bytes.Equal(result.Data, data) {
		t.Errorf("data mismatch: got %v, want %v", result.Data, data)
	}
}

func TestEncryptPayloadNilPanics(t *testing.T) {
	key, _ := GenerateKey()
	_, err := EncryptPayload(nil, key)
	if err == nil {
		t.Fatal("expected error for nil payload")
	}
}

func TestDecryptPayloadFileEmptyNameFallback(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}

	// Encrypt an envelope where name is empty string — simulates missing name
	original := &WhisperPayload{
		Type:     "file",
		Name:     "",
		MimeType: "application/octet-stream",
		Data:     []byte{1, 2, 3},
	}
	encrypted, err := EncryptPayload(original, key)
	if err != nil {
		t.Fatalf("EncryptPayload failed: %v", err)
	}

	result, err := DecryptPayload(encrypted, key)
	if err != nil {
		t.Fatalf("DecryptPayload failed: %v", err)
	}

	if result.Name != "file" {
		t.Errorf("expected name fallback to 'file', got %q", result.Name)
	}
}

func TestDecryptPayloadLegacy(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}

	// Legacy secret: encrypted with Encrypt (no envelope)
	legacy, err := Encrypt("legacy secret", key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	result, err := DecryptPayload(legacy, key)
	if err != nil {
		t.Fatalf("DecryptPayload failed: %v", err)
	}

	if result.Type != "text" || result.Text != "legacy secret" {
		t.Errorf("unexpected result: %+v", result)
	}
}

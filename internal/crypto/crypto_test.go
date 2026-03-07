package crypto

import (
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

	if payload.Ciphertext == "" || payload.IV == "" || payload.Salt == "" {
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

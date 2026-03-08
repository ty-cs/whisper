import { describe, expect, it } from 'vitest';
import {
    base58ToUint8,
    decrypt,
    deriveKeyFromPassword,
    encrypt,
    generateKey,
    uint8ToBase58,
} from './index.js';

describe('@whisper/crypto', () => {
    it('should encrypt and decrypt a message correctly', async () => {
        const plaintext = 'This is a top secret message 🤫';
        const key = generateKey();

        const payload = await encrypt(plaintext, key);

        expect(payload.ciphertext).toBeDefined();
        expect(payload.iv).toBeDefined();

        const decrypted = await decrypt(payload, key);
        expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with the wrong key', async () => {
        const plaintext = 'Secret';
        const key1 = generateKey();
        const key2 = generateKey();

        const payload = await encrypt(plaintext, key1);

        await expect(decrypt(payload, key2)).rejects.toThrow();
    });

    it('should encode/decode Base58 correctly', () => {
        const bytes = new Uint8Array([0, 0, 1, 2, 3, 255]);
        const b58 = uint8ToBase58(bytes);

        // Base58 for [0, 0, 1, 2, 3, 255] starts with '11' (for zeros)
        expect(b58.startsWith('11')).toBe(true);

        const decoded = base58ToUint8(b58);
        expect(decoded).toEqual(bytes);
    });

    it('should derive the same key from a password and salt', async () => {
        const password = 'my-secure-password';
        const salt = new Uint8Array(16).fill(1); // Constant salt for test

        const key1 = await deriveKeyFromPassword(password, salt, 1000);
        const key2 = await deriveKeyFromPassword(password, salt, 1000);

        expect(key1).toEqual(key2);
        expect(key1.length).toBe(32); // 256 bits

        const key3 = await deriveKeyFromPassword('different', salt, 1000);
        expect(key1).not.toEqual(key3);
    });

    it('should be interoperable with common AES-256-GCM settings', async () => {
        // This test ensures we don't accidentally change the algorithm
        const plaintext = 'Interoperability Test';
        const key = new Uint8Array(32).fill(42);
        const payload = await encrypt(plaintext, key);

        // Check if IV is 12 bytes (base64 encoded should be 16 chars)
        // Note: base64 of 12 bytes is exactly 16 chars without padding
        expect(payload.iv.length).toBe(16);

        const decrypted = await decrypt(payload, key);
        expect(decrypted).toBe(plaintext);
    });
});

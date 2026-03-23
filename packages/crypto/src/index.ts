/**
 * @whisper/crypto — Isomorphic AES-256-GCM encryption library
 *
 * Works in browsers (WebCrypto), Cloudflare Workers, Vercel Edge,
 * and Node.js 20+ (globalThis.crypto).
 */

// Base58 alphabet (Bitcoin-style, no ambiguous chars)
const BASE58_ALPHABET =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export interface EncryptedPayload {
    ciphertext: string; // base64
    iv: string; // base64
}

export type WhisperPayload =
    | { type: 'text'; text: string }
    | { type: 'file'; name: string; mimeType: string; data: Uint8Array };

interface WhisperEnvelope {
    __w: 1;
    type: 'text' | 'file';
    text?: string;
    name?: string;
    mime?: string;
    data?: string; // base64-encoded file bytes
}

/**
 * Generate a random 256-bit encryption key.
 */
export function generateKey(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * @param plaintext - The text to encrypt
 * @param key - 256-bit key (32 bytes)
 * @returns Encrypted payload with ciphertext and IV (all base64)
 */
export async function encrypt(
    plaintext: string,
    key: Uint8Array,
): Promise<EncryptedPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key.buffer as ArrayBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
    );

    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        cryptoKey,
        encoded,
    );

    return {
        ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
        iv: uint8ToBase64(iv),
    };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * @param payload - The encrypted payload
 * @param key - 256-bit key (32 bytes)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key, tampered data)
 */
export async function decrypt(
    payload: EncryptedPayload,
    key: Uint8Array,
): Promise<string> {
    const ciphertext = base64ToUint8(payload.ciphertext);
    const iv = base64ToUint8(payload.iv);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key.buffer as ArrayBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        cryptoKey,
        ciphertext.buffer as ArrayBuffer,
    );

    return new TextDecoder().decode(decrypted);
}

/**
 * Derive an encryption key from a password using PBKDF2.
 * Used for optional password protection (double-encryption).
 */
export async function deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number = 600_000,
): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password).buffer as ArrayBuffer,
        'PBKDF2',
        false,
        ['deriveBits'],
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations,
            hash: 'SHA-256',
        },
        keyMaterial,
        256,
    );

    return new Uint8Array(derived);
}

/**
 * Encode a Uint8Array to Base58 string (URL-safe, no ambiguous chars).
 */
export function uint8ToBase58(bytes: Uint8Array): string {
    // Count leading zeros
    let zeros = 0;
    for (const byte of bytes) {
        if (byte === 0) zeros++;
        else break;
    }

    // Convert to big integer
    let num = 0n;
    for (const byte of bytes) {
        num = num * 256n + BigInt(byte);
    }

    // Convert to base58
    let result = '';
    while (num > 0n) {
        const remainder = Number(num % 58n);
        num = num / 58n;
        result = BASE58_ALPHABET[remainder] + result;
    }

    // Add leading '1's for each leading zero byte
    return '1'.repeat(zeros) + result;
}

/**
 * Decode a Base58 string back to Uint8Array.
 */
export function base58ToUint8(str: string): Uint8Array {
    // Count leading '1's
    let zeros = 0;
    for (const char of str) {
        if (char === '1') zeros++;
        else break;
    }

    // Convert from base58 to big integer
    let num = 0n;
    for (const char of str) {
        const index = BASE58_ALPHABET.indexOf(char);
        if (index === -1) throw new Error(`Invalid base58 character: ${char}`);
        num = num * 58n + BigInt(index);
    }

    // Convert big integer to bytes
    const bytes: number[] = [];
    while (num > 0n) {
        bytes.unshift(Number(num & 0xffn));
        num = num >> 8n;
    }

    // Add leading zero bytes
    const result = new Uint8Array(zeros + bytes.length);
    result.set(new Uint8Array(bytes), zeros);
    return result;
}

/**
 * Encrypt a WhisperPayload (text or file) using AES-256-GCM.
 * All new secrets — text and file — go through this function.
 */
export async function encryptPayload(
    payload: WhisperPayload,
    key: Uint8Array,
): Promise<EncryptedPayload> {
    let envelope: WhisperEnvelope;
    if (payload.type === 'text') {
        envelope = { __w: 1, type: 'text', text: payload.text };
    } else {
        envelope = {
            __w: 1,
            type: 'file',
            name: payload.name,
            mime: payload.mimeType,
            data: uint8ToBase64(payload.data),
        };
    }
    return encrypt(JSON.stringify(envelope), key);
}

/**
 * Decrypt an EncryptedPayload back to a WhisperPayload.
 * Handles both structured envelopes (new) and legacy plain-text secrets.
 */
export async function decryptPayload(
    encrypted: EncryptedPayload,
    key: Uint8Array,
): Promise<WhisperPayload> {
    const plaintext = await decrypt(encrypted, key);

    let parsed: unknown;
    try {
        parsed = JSON.parse(plaintext);
    } catch {
        // Legacy plain-text secret
        return { type: 'text', text: plaintext };
    }

    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('__w' in parsed) ||
        (parsed as WhisperEnvelope).__w !== 1
    ) {
        // JSON but no envelope marker — treat as legacy text
        return { type: 'text', text: plaintext };
    }

    const env = parsed as WhisperEnvelope;

    if (env.type === 'file') {
        return {
            type: 'file',
            name: env.name ?? 'file',
            mimeType: env.mime ?? 'application/octet-stream',
            data: base64ToUint8(env.data ?? ''),
        };
    }

    return { type: 'text', text: env.text ?? plaintext };
}

// --- Base64 helpers (isomorphic) ---

function uint8ToBase64(bytes: Uint8Array): string {
    // Works in browser, Workers, and Node.js
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

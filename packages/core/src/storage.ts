/**
 * Storage adapter interface — the abstraction that lets us swap
 * between Upstash Redis, Cloudflare KV, DynamoDB, SQLite, etc.
 */

export interface SecretRecord {
    id: string;
    ciphertext: string;      // base64 AES-256-GCM ciphertext
    iv: string;              // base64 initialization vector
    salt: string;            // base64 salt (for password derivation)
    expiresAt: number;       // unix timestamp (seconds)
    burnAfterReading: boolean;
    maxViews: number;        // 0 = unlimited
    viewCount: number;
    hasPassword: boolean;    // whether secret is password-protected
    createdAt: number;       // unix timestamp (seconds)
}

export interface CreateSecretInput {
    ciphertext: string;
    iv: string;
    salt: string;
    expiresIn: string;       // "5m" | "1h" | "24h" | "7d" | "30d"
    burnAfterReading?: boolean;
    maxViews?: number;
    hasPassword?: boolean;
}

/**
 * Parse a human-readable duration string to seconds.
 */
export function parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(m|h|d)$/);
    if (!match) throw new Error(`Invalid duration: ${duration}`);

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: throw new Error(`Unknown unit: ${unit}`);
    }
}

/**
 * Allowed expiry options.
 */
export const EXPIRY_OPTIONS = ['5m', '1h', '24h', '7d', '30d'] as const;

/**
 * The storage adapter interface.
 * Implement this for each platform (Upstash, KV, DynamoDB, SQLite).
 */
export interface StorageAdapter {
    /**
     * Save a secret with a TTL.
     * The adapter should auto-expire the record after ttlSeconds.
     */
    save(record: SecretRecord, ttlSeconds: number): Promise<void>;

    /**
     * Get a secret by ID. Returns null if not found or expired.
     */
    get(id: string): Promise<SecretRecord | null>;

    /**
     * Delete a secret by ID. Returns true if it existed.
     */
    delete(id: string): Promise<boolean>;
}

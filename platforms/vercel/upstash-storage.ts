/**
 * Upstash Redis storage adapter.
 * Uses @upstash/redis HTTP client — works in Vercel Edge, Cloudflare Workers, etc.
 */

import { Redis } from '@upstash/redis';
import type { SecretRecord, StorageAdapter } from '@whisper/core/storage';

export class UpstashStorage implements StorageAdapter {
    private redis: Redis;

    constructor(url: string, token: string) {
        this.redis = new Redis({ url, token });
    }

    async save(record: SecretRecord, ttlSeconds: number): Promise<void> {
        const key = `secret:${record.id}`;
        await this.redis.set(key, JSON.stringify(record), { ex: ttlSeconds });
    }

    async get(id: string): Promise<SecretRecord | null> {
        const key = `secret:${id}`;
        const data = await this.redis.get<string>(key);
        if (!data) return null;

        // @upstash/redis may auto-parse JSON, handle both cases
        if (typeof data === 'string') {
            return JSON.parse(data) as SecretRecord;
        }
        return data as unknown as SecretRecord;
    }

    async delete(id: string): Promise<boolean> {
        const key = `secret:${id}`;
        const deleted = await this.redis.del(key);
        return deleted > 0;
    }
}

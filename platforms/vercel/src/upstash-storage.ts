/**
 * Upstash Redis storage adapter.
 * Uses @upstash/redis HTTP client — works in Vercel Edge, Cloudflare Workers, etc.
 */

import { Redis } from '@upstash/redis';
import type { SecretRecord, StorageAdapter } from '@whisper/core/storage';

// Atomically consume a secret in a single Redis round-trip.
//
// The script:
//   1. GETs the record — returns nil if missing
//   2. Checks expiry — deletes + returns nil if expired
//   3. Checks view limit — deletes + returns nil if exhausted
//   4. Increments viewCount
//   5. Deletes if burnAfterReading or viewCount just hit maxViews,
//      otherwise SETs the updated record back with the remaining TTL
//   6. Returns the (updated) record as JSON
//
// Because Redis executes Lua scripts atomically, no two concurrent
// requests can both pass steps 2–3 for the same key.
const CONSUME_SCRIPT = `
local data = redis.call('GET', KEYS[1])
if not data then return nil end

local r = cjson.decode(data)
local now = tonumber(ARGV[1])

if r.expiresAt < now then
  redis.call('DEL', KEYS[1])
  return nil
end

if r.maxViews > 0 and r.viewCount >= r.maxViews then
  redis.call('DEL', KEYS[1])
  return nil
end

r.viewCount = r.viewCount + 1

local shouldBurn = r.burnAfterReading or (r.maxViews > 0 and r.viewCount >= r.maxViews)

if shouldBurn then
  redis.call('DEL', KEYS[1])
else
  local ttl = r.expiresAt - now
  if ttl > 0 then
    redis.call('SET', KEYS[1], cjson.encode(r), 'EX', ttl)
  end
end

return cjson.encode(r)
`;

export class UpstashStorage implements StorageAdapter {
    private redis: Redis;

    constructor(url?: string, token?: string) {
        if (!url || !token) {
            throw new Error(
                '[upstash] Fatal: Missing Upstash Redis credentials. Please ensure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in your environment.',
            );
        }
        this.redis = new Redis({ url, token });
    }

    async save(record: SecretRecord, ttlSeconds: number): Promise<void> {
        const key = `secret:${record.id}`;
        console.log('[upstash] save', {
            key,
            ttlSeconds,
            burnAfterReading: record.burnAfterReading,
            maxViews: record.maxViews,
        });
        await this.redis.set(key, JSON.stringify(record), { ex: ttlSeconds });
        console.log('[upstash] save ok', { key });
    }

    async get(id: string): Promise<SecretRecord | null> {
        const key = `secret:${id}`;
        console.log('[upstash] get', { key });
        const data = await this.redis.get<string>(key);
        console.log('[upstash] [debug] data', data);
        if (!data) {
            console.log('[upstash] get miss', { key });
            return null;
        }

        // @upstash/redis may auto-parse JSON, handle both cases
        console.log(`[upstash] get typeof data: ${typeof data}`);
        if (typeof data === 'string') {
            console.log(`[upstash] get manual parse executed`);
            return JSON.parse(data) as SecretRecord;
        }
        console.log(`[upstash] get auto-parsed!`);
        return data as unknown as SecretRecord;
    }

    async delete(id: string): Promise<boolean> {
        const key = `secret:${id}`;
        console.log('[upstash] delete', { key });
        const deleted = await this.redis.del(key);
        console.log('[upstash] delete result', { key, deleted });
        return deleted > 0;
    }

    async consume(id: string): Promise<SecretRecord | null> {
        const key = `secret:${id}`;
        const now = Math.floor(Date.now() / 1000);
        console.log('[upstash] consume', { key, now });
        const result = await this.redis.eval<unknown[], SecretRecord | null>(
            CONSUME_SCRIPT,
            [key],
            [now],
        );
        if (!result) {
            console.log(
                '[upstash] consume miss (expired, exhausted, or not found)',
                { key },
            );
            return null;
        }
        console.log('[upstash] consume hit', {
            key,
            viewCount: result.viewCount,
            burned: result.burnAfterReading,
        });
        return result;
    }
}

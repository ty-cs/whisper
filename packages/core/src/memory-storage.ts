/**
 * In-memory storage adapter for local development and testing.
 * Secrets are stored in a Map with setTimeout-based TTL expiry.
 */

import type { SecretRecord, StorageAdapter } from './storage.js';

export class MemoryStorage implements StorageAdapter {
    private store = new Map<string, SecretRecord>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();

    async save(record: SecretRecord, ttlSeconds: number): Promise<void> {
        const key = `secret:${record.id}`;

        // Clear any existing timer
        const existing = this.timers.get(key);
        if (existing) clearTimeout(existing);

        this.store.set(key, { ...record });

        // Auto-expire
        const timer = setTimeout(() => {
            this.store.delete(key);
            this.timers.delete(key);
        }, ttlSeconds * 1000);

        // Don't block Node.js from exiting
        if (timer.unref) timer.unref();

        this.timers.set(key, timer);
    }

    async get(id: string): Promise<SecretRecord | null> {
        const key = `secret:${id}`;
        const record = this.store.get(key);
        return record ? { ...record } : null;
    }

    async delete(id: string): Promise<boolean> {
        const key = `secret:${id}`;
        const existed = this.store.has(key);

        const timer = this.timers.get(key);
        if (timer) clearTimeout(timer);

        this.store.delete(key);
        this.timers.delete(key);

        return existed;
    }

    // Single-process: no real concurrency risk, but implements the interface
    // so tests exercise the same consume() code path as production.
    async consume(id: string): Promise<SecretRecord | null> {
        const key = `secret:${id}`;
        const record = this.store.get(key);
        if (!record) return null;

        const now = Math.floor(Date.now() / 1000);

        if (record.expiresAt < now) {
            await this.delete(id);
            return null;
        }

        if (record.maxViews > 0 && record.viewCount >= record.maxViews) {
            await this.delete(id);
            return null;
        }

        record.viewCount += 1;

        const shouldBurn =
            record.burnAfterReading ||
            (record.maxViews > 0 && record.viewCount >= record.maxViews);

        if (shouldBurn) {
            await this.delete(id);
        } else {
            const remainingTtl = record.expiresAt - now;
            if (remainingTtl > 0) {
                await this.save(record, remainingTtl);
            }
        }

        return { ...record };
    }
}

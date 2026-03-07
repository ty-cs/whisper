import { describe, expect, it } from 'vitest';
import { MemoryStorage } from './memory-storage.js';
import type { SecretRecord } from './storage.js';

function makeRecord(overrides: Partial<SecretRecord> = {}): SecretRecord {
    const now = Math.floor(Date.now() / 1000);
    return {
        id: 'test-id',
        ciphertext: 'ct',
        iv: 'iv',
        salt: 'salt',
        expiresAt: now + 3600,
        burnAfterReading: false,
        maxViews: 0,
        viewCount: 0,
        hasPassword: false,
        createdAt: now,
        ...overrides,
    };
}

describe('MemoryStorage.consume', () => {
    it('returns the record and increments viewCount', async () => {
        const storage = new MemoryStorage();
        const record = makeRecord();
        await storage.save(record, 3600);

        const result = await storage.consume('test-id');
        expect(result).not.toBeNull();
        expect(result!.viewCount).toBe(1);
    });

    it('returns null for a non-existent id', async () => {
        const storage = new MemoryStorage();
        expect(await storage.consume('no-such-id')).toBeNull();
    });

    it('returns null and deletes an expired secret', async () => {
        const storage = new MemoryStorage();
        const record = makeRecord({
            expiresAt: Math.floor(Date.now() / 1000) - 1,
        });
        await storage.save(record, 3600);

        expect(await storage.consume('test-id')).toBeNull();
        expect(await storage.get('test-id')).toBeNull();
    });

    it('deletes on burn after reading and blocks a second consume', async () => {
        const storage = new MemoryStorage();
        await storage.save(makeRecord({ burnAfterReading: true }), 3600);

        const first = await storage.consume('test-id');
        expect(first).not.toBeNull();

        const second = await storage.consume('test-id');
        expect(second).toBeNull();
    });

    it('enforces maxViews and deletes on the last allowed view', async () => {
        const storage = new MemoryStorage();
        await storage.save(makeRecord({ maxViews: 2 }), 3600);

        expect((await storage.consume('test-id'))!.viewCount).toBe(1);
        expect((await storage.consume('test-id'))!.viewCount).toBe(2);
        expect(await storage.consume('test-id')).toBeNull();
        // Key is gone
        expect(await storage.get('test-id')).toBeNull();
    });

    it('concurrent consumes on a burn secret — only one wins', async () => {
        const storage = new MemoryStorage();
        await storage.save(makeRecord({ burnAfterReading: true }), 3600);

        // Both start at the same time; MemoryStorage.delete() runs synchronously
        // before yielding, so exactly one coroutine deletes the key first.
        const [r1, r2] = await Promise.all([
            storage.consume('test-id'),
            storage.consume('test-id'),
        ]);

        const served = [r1, r2].filter(Boolean);
        expect(served).toHaveLength(1);
    });

    it('concurrent consumes on a maxViews=1 secret — only one wins', async () => {
        const storage = new MemoryStorage();
        await storage.save(makeRecord({ maxViews: 1 }), 3600);

        const [r1, r2] = await Promise.all([
            storage.consume('test-id'),
            storage.consume('test-id'),
        ]);

        const served = [r1, r2].filter(Boolean);
        expect(served).toHaveLength(1);
    });
});

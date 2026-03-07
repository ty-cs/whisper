import { describe, it, expect } from 'vitest';
import { createApp } from './app.js';
import { MemoryStorage } from './memory-storage.js';

describe('@whisper/core app', () => {
    it('should have a health check endpoint', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const res = await app.request('/api/health');
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.status).toBe('ok');
    });

    it('should be able to create and retrieve a secret', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        // Create secret
        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'test-ciphertext',
                iv: 'test-iv',
                salt: 'test-salt',
                expiresIn: '1h',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        expect(createRes.status).toBe(201);
        const { id } = await createRes.json();
        expect(id).toBeDefined();

        // Retrieve secret
        const getRes = await app.request(`/api/secrets/${id}`);
        expect(getRes.status).toBe(200);

        const secret = await getRes.json();
        expect(secret.ciphertext).toBe('test-ciphertext');
    });

    it('should return 404 for non-existent secret', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const res = await app.request('/api/secrets/invalid-id');
        expect(res.status).toBe(404);
    });

    it('should respect burn after reading', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        // Create secret with burnAfterReading
        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'burn-me',
                iv: 'iv',
                salt: 'salt',
                expiresIn: '1h',
                burnAfterReading: true,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const { id } = await createRes.json();

        // First view — works
        const firstRes = await app.request(`/api/secrets/${id}`);
        expect(firstRes.status).toBe(200);

        // Second view — 404
        const secondRes = await app.request(`/api/secrets/${id}`);
        expect(secondRes.status).toBe(404);
    });
});

import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { MemoryStorage } from './memory-storage.js';

describe('@whisper/core app', () => {
    it('should have a health check endpoint', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const res = await app.request('/api/health');
        expect(res.status).toBe(200);

        const body = (await res.json()) as { status: string };
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
        const { id } = (await createRes.json()) as { id: string };
        expect(id).toBeDefined();

        // Retrieve secret
        const getRes = await app.request(`/api/secrets/${id}`);
        expect(getRes.status).toBe(200);

        const secret = (await getRes.json()) as { ciphertext: string };
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

        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'burn-me',
                iv: 'iv',
                salt: 'salt',
                expiresIn: '1h',
                burnAfterReading: true,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { id } = (await createRes.json()) as { id: string };

        const firstRes = await app.request(`/api/secrets/${id}`);
        expect(firstRes.status).toBe(200);

        const secondRes = await app.request(`/api/secrets/${id}`);
        expect(secondRes.status).toBe(404);
    });

    it('should enforce maxViews', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'limited',
                iv: 'iv',
                salt: 'salt',
                expiresIn: '1h',
                maxViews: 2,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { id } = (await createRes.json()) as { id: string };

        // Views 1 and 2 succeed
        expect((await app.request(`/api/secrets/${id}`)).status).toBe(200);
        expect((await app.request(`/api/secrets/${id}`)).status).toBe(200);

        // View 3 is rejected
        expect((await app.request(`/api/secrets/${id}`)).status).toBe(404);
    });

    it('should delete a secret', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'delete-me',
                iv: 'iv',
                salt: 'salt',
                expiresIn: '1h',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { id } = (await createRes.json()) as { id: string };

        const deleteRes = await app.request(`/api/secrets/${id}`, {
            method: 'DELETE',
        });
        expect(deleteRes.status).toBe(200);

        // Gone after delete
        expect((await app.request(`/api/secrets/${id}`)).status).toBe(404);

        // Second delete returns 404
        const secondDelete = await app.request(`/api/secrets/${id}`, {
            method: 'DELETE',
        });
        expect(secondDelete.status).toBe(404);
    });
});

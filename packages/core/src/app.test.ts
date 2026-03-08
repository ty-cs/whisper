import { describe, expect, it } from 'vitest';
import type {
    CreateSecretResponse,
    DeleteSecretResponse,
    GetSecretResponse,
} from './api-types';
import { createApp } from './app';
import { ErrorCode } from './errors';
import { MemoryStorage } from './memory-storage';

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

                expiresIn: '1h',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        expect(createRes.status).toBe(201);
        const createBody = (await createRes.json()) as CreateSecretResponse;
        expect(createBody.code).toBe(ErrorCode.OK);
        expect(createBody.id).toBeDefined();

        // Retrieve secret
        const getRes = await app.request(`/api/secrets/${createBody.id}`);
        expect(getRes.status).toBe(200);

        const secret = (await getRes.json()) as GetSecretResponse;
        expect(secret.code).toBe(ErrorCode.OK);
        expect(secret.ciphertext).toBe('test-ciphertext');
    });

    it('should return 404 for non-existent secret', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const res = await app.request('/api/secrets/invalid-id');
        expect(res.status).toBe(404);

        const body = (await res.json()) as { code: number };
        expect(body.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should respect burn after reading', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'burn-me',
                iv: 'iv',

                expiresIn: '1h',
                burnAfterReading: true,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { id } = (await createRes.json()) as CreateSecretResponse;

        const firstRes = await app.request(`/api/secrets/${id}`);
        expect(firstRes.status).toBe(200);

        const secondRes = await app.request(`/api/secrets/${id}`);
        expect(secondRes.status).toBe(404);

        const secondBody = (await secondRes.json()) as { code: number };
        expect(secondBody.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should enforce maxViews', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'limited',
                iv: 'iv',

                expiresIn: '1h',
                maxViews: 2,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { id } = (await createRes.json()) as CreateSecretResponse;

        // Views 1 and 2 succeed
        expect((await app.request(`/api/secrets/${id}`)).status).toBe(200);
        expect((await app.request(`/api/secrets/${id}`)).status).toBe(200);

        // View 3 is rejected
        const thirdRes = await app.request(`/api/secrets/${id}`);
        expect(thirdRes.status).toBe(404);

        const thirdBody = (await thirdRes.json()) as { code: number };
        expect(thirdBody.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should reject negative maxViews', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const res = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'c',
                iv: 'iv',

                expiresIn: '1h',
                maxViews: -1,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as { code: number };
        expect(body.code).toBe(ErrorCode.MAX_VIEWS_EXCEEDED);
    });

    it('should reject burnAfterReading combined with maxViews > 1', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const res = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'c',
                iv: 'iv',

                expiresIn: '1h',
                burnAfterReading: true,
                maxViews: 2,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as { code: number };
        expect(body.code).toBe(ErrorCode.CONFLICTING_OPTIONS);
    });

    it('should delete a secret', async () => {
        const storage = new MemoryStorage();
        const app = createApp(storage);

        const createRes = await app.request('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({
                ciphertext: 'delete-me',
                iv: 'iv',

                expiresIn: '1h',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { id } = (await createRes.json()) as CreateSecretResponse;

        const deleteRes = await app.request(`/api/secrets/${id}`, {
            method: 'DELETE',
        });
        expect(deleteRes.status).toBe(200);

        const deleteBody = (await deleteRes.json()) as DeleteSecretResponse;
        expect(deleteBody.code).toBe(ErrorCode.OK);
        expect(deleteBody.deleted).toBe(true);

        // Gone after delete
        expect((await app.request(`/api/secrets/${id}`)).status).toBe(404);

        // Second delete returns 404
        const secondDelete = await app.request(`/api/secrets/${id}`, {
            method: 'DELETE',
        });
        expect(secondDelete.status).toBe(404);

        const secondDeleteBody = (await secondDelete.json()) as {
            code: number;
        };
        expect(secondDeleteBody.code).toBe(ErrorCode.NOT_FOUND);
    });
});

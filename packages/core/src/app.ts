/**
 * Hono API application factory.
 * Platform-agnostic: takes a StorageAdapter, returns a fully configured Hono app.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import {
    type CreateSecretInput,
    EXPIRY_OPTIONS,
    parseDuration,
    type SecretRecord,
    type StorageAdapter,
} from './storage.js';

export type AppEnv = {
    Variables: {
        storage: StorageAdapter;
    };
};

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

/**
 * Create a Hono app with the given storage adapter.
 */
export function createApp(storage: StorageAdapter): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    // --- Middleware ---
    app.use('*', cors());

    // Inject storage adapter into context
    app.use('/api/*', async (c, next) => {
        c.set('storage', storage);
        await next();
    });

    // --- Health Check ---
    app.get('/api/health', (c) => {
        return c.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        });
    });

    // --- Create Secret ---
    app.post('/api/secrets', async (c) => {
        const body = await c.req.json<CreateSecretInput>();

        // Validate required fields
        if (!body.ciphertext || !body.iv || !body.salt) {
            return c.json(
                { error: 'Missing required fields: ciphertext, iv, salt' },
                400,
            );
        }

        // Validate expiry
        const expiresIn = body.expiresIn || '24h';
        if (!EXPIRY_OPTIONS.includes(expiresIn as any)) {
            return c.json(
                {
                    error: `Invalid expiresIn. Must be one of: ${EXPIRY_OPTIONS.join(', ')}`,
                },
                400,
            );
        }

        // Validate payload size (approximate — base64 encoded)
        const payloadSize =
            body.ciphertext.length + body.iv.length + body.salt.length;
        if (payloadSize > MAX_BODY_SIZE) {
            return c.json({ error: 'Payload too large. Maximum 1 MB.' }, 413);
        }

        const ttlSeconds = parseDuration(expiresIn);
        const now = Math.floor(Date.now() / 1000);
        const id = nanoid(21);

        const record: SecretRecord = {
            id,
            ciphertext: body.ciphertext,
            iv: body.iv,
            salt: body.salt,
            expiresAt: now + ttlSeconds,
            burnAfterReading: body.burnAfterReading ?? false,
            maxViews: body.maxViews ?? 0,
            viewCount: 0,
            hasPassword: body.hasPassword ?? false,
            createdAt: now,
        };

        const storage = c.get('storage');
        await storage.save(record, ttlSeconds);

        return c.json(
            {
                id,
                expiresAt: record.expiresAt,
                burnAfterReading: record.burnAfterReading,
            },
            201,
        );
    });

    // --- Get Secret ---
    app.get('/api/secrets/:id', async (c) => {
        const id = c.req.param('id');
        const storage = c.get('storage');

        const record = await storage.consume(id);
        if (!record) {
            return c.json({ error: 'Secret not found or has expired' }, 404);
        }

        return c.json({
            ciphertext: record.ciphertext,
            iv: record.iv,
            salt: record.salt,
            burnAfterReading: record.burnAfterReading,
            hasPassword: record.hasPassword,
            expiresAt: record.expiresAt,
            maxViews: record.maxViews,
            viewCount: record.viewCount,
        });
    });

    // --- Delete Secret ---
    app.delete('/api/secrets/:id', async (c) => {
        const id = c.req.param('id');
        const storage = c.get('storage');
        const deleted = await storage.delete(id);

        if (!deleted) {
            return c.json({ error: 'Secret not found' }, 404);
        }

        return c.json({ deleted: true });
    });

    return app;
}

export type { StorageAdapter, SecretRecord, CreateSecretInput };

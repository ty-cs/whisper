/**
 * Hono API application factory.
 * Platform-agnostic: takes a StorageAdapter, returns a fully configured Hono app.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { nanoid } from 'nanoid';
import type {
    ApiErrorResponse,
    CreateSecretRequest,
    CreateSecretResponse,
    DeleteSecretResponse,
    GetSecretResponse,
} from './api-types';
import { ErrorCode } from './errors';
import {
    EXPIRY_OPTIONS,
    parseDuration,
    type SecretRecord,
    type StorageAdapter,
} from './storage';

export type AppEnv = {
    Variables: {
        storage: StorageAdapter;
    };
};

const MAX_BODY_SIZE = 7 * 1024 * 1024; // 7 MB — accommodates 5 MB file + base64 overhead

/**
 * Create a Hono app with the given storage adapter.
 */
export function createApp(storage: StorageAdapter): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    // --- Global error handler ---
    app.onError((err, c) => {
        if (err instanceof HTTPException) {
            return c.json(
                {
                    code: ErrorCode.MISSING_FIELDS,
                    error: err.message,
                } satisfies ApiErrorResponse,
                err.status,
            );
        }
        console.error(err);
        return c.json(
            {
                code: ErrorCode.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            },
            500,
        );
    });

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
    app.post(
        '/api/secrets',
        validator('json', (value, c) => {
            if (!value || typeof value !== 'object') {
                return c.json(
                    {
                        code: ErrorCode.MISSING_FIELDS,
                        error: 'Missing required fields: ciphertext, iv',
                    } satisfies ApiErrorResponse,
                    400,
                );
            }
            return value as CreateSecretRequest;
        }),
        async (c) => {
            const body = c.req.valid('json');

            // Validate required fields
            if (!body.ciphertext || !body.iv) {
                return c.json(
                    {
                        code: ErrorCode.MISSING_FIELDS,
                        error: 'Missing required fields: ciphertext, iv',
                    } satisfies ApiErrorResponse,
                    400,
                );
            }

            // Validate expiry
            const expiresIn = body.expiresIn || '24h';
            if (
                !EXPIRY_OPTIONS.includes(
                    expiresIn as (typeof EXPIRY_OPTIONS)[number],
                )
            ) {
                return c.json(
                    {
                        code: ErrorCode.INVALID_EXPIRY,
                        error: `Invalid expiresIn. Must be one of: ${EXPIRY_OPTIONS.join(', ')}`,
                    } satisfies ApiErrorResponse,
                    400,
                );
            }

            // Validate payload size (approximate — base64 encoded)
            const payloadSize = body.ciphertext.length + body.iv.length;
            if (payloadSize > MAX_BODY_SIZE) {
                return c.json(
                    {
                        code: ErrorCode.PAYLOAD_TOO_LARGE,
                        error: 'Payload too large. Maximum 7 MB.',
                    } satisfies ApiErrorResponse,
                    413,
                );
            }

            const maxViews = body.maxViews ?? 0;
            if (maxViews < 0 || maxViews > 10000) {
                return c.json(
                    {
                        code: ErrorCode.MAX_VIEWS_EXCEEDED,
                        error: 'Invalid maxViews. Must be between 0 and 10,000.',
                    } satisfies ApiErrorResponse,
                    400,
                );
            }

            if ((body.burnAfterReading ?? false) && maxViews > 1) {
                return c.json(
                    {
                        code: ErrorCode.CONFLICTING_OPTIONS,
                        error: 'burnAfterReading and maxViews > 1 are mutually exclusive.',
                    } satisfies ApiErrorResponse,
                    400,
                );
            }

            const ttlSeconds = parseDuration(expiresIn);
            const now = Math.floor(Date.now() / 1000);
            const id = nanoid(21);

            const record: SecretRecord = {
                id,
                ciphertext: body.ciphertext,
                iv: body.iv,
                expiresAt: now + ttlSeconds,
                burnAfterReading: body.burnAfterReading ?? false,
                maxViews,
                viewCount: 0,
                hasPassword: body.hasPassword ?? false,
                createdAt: now,
            };

            const storage = c.get('storage');
            await storage.save(record, ttlSeconds);

            return c.json(
                {
                    code: ErrorCode.OK,
                    id,
                    expiresAt: record.expiresAt,
                    burnAfterReading: record.burnAfterReading,
                } satisfies CreateSecretResponse,
                201,
            );
        },
    );

    // --- Get Secret ---
    app.get('/api/secrets/:id', async (c) => {
        const id = c.req.param('id');
        const storage = c.get('storage');

        const record = await storage.consume(id);
        if (!record) {
            return c.json(
                {
                    code: ErrorCode.NOT_FOUND,
                    error: 'Secret not found or has expired',
                } satisfies ApiErrorResponse,
                404,
            );
        }

        return c.json({
            code: ErrorCode.OK,
            ciphertext: record.ciphertext,
            iv: record.iv,
            burnAfterReading: record.burnAfterReading,
            hasPassword: record.hasPassword,
            expiresAt: record.expiresAt,
            maxViews: record.maxViews,
            viewCount: record.viewCount,
        } satisfies GetSecretResponse);
    });

    // --- Delete Secret ---
    app.delete('/api/secrets/:id', async (c) => {
        const id = c.req.param('id');
        const storage = c.get('storage');
        const deleted = await storage.delete(id);

        if (!deleted) {
            return c.json(
                {
                    code: ErrorCode.NOT_FOUND,
                    error: 'Secret not found',
                } satisfies ApiErrorResponse,
                404,
            );
        }

        return c.json({
            code: ErrorCode.OK,
            deleted: true,
        } satisfies DeleteSecretResponse);
    });

    return app;
}

export type AppType = ReturnType<typeof createApp>;
export type { SecretRecord, StorageAdapter };

/**
 * Vercel entry point.
 * Wires up the Hono app with Upstash Redis storage.
 */

import { createApp } from '@whisper/core';
// biome-ignore lint/correctness/noUnusedImports: required for Vercel zero-config Hono detection
import { Hono } from 'hono';
import { UpstashStorage } from './upstash-storage.js';

const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
        'Missing required environment variables: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN',
    );
}

const storage = new UpstashStorage(
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
);

export default createApp(storage);

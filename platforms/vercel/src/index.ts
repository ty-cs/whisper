/**
 * Vercel entry point.
 * Wires up the Hono app with Upstash Redis storage.
 */

import { createApp } from '@whisper/core';
import { UpstashStorage } from './upstash-storage.js';

const storage = new UpstashStorage(
    process.env.UPSTASH_REDIS_REST_URL!,
    process.env.UPSTASH_REDIS_REST_TOKEN!,
);

export default createApp(storage);

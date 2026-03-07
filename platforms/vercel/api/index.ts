/**
 * Vercel Edge Function entry point.
 * Wires up the Hono app with Upstash Redis storage.
 */

import { handle } from 'hono/vercel';
import { createApp } from '@whisper/core';
import { UpstashStorage } from '../upstash-storage.js';

const storage = new UpstashStorage(
    process.env.UPSTASH_REDIS_REST_URL!,
    process.env.UPSTASH_REDIS_REST_TOKEN!
);

const app = createApp(storage);

// Vercel Edge handler
export default handle(app);

// Use Edge Runtime for minimal cold starts
export const runtime = 'edge';

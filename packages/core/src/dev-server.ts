/**
 * Local development server.
 * Uses @hono/node-server serve() to keep the process alive.
 *
 * Usage: bun run packages/core/src/dev-server.ts
 */

import { createApp } from './app';
import { MemoryStorage } from './memory-storage';

const PORT = parseInt(process.env.PORT || '4000', 10);

const storage = new MemoryStorage();
const app = createApp(storage);

export default {
    port: PORT,
    fetch: app.fetch,
};

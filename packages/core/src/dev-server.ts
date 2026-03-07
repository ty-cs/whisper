/**
 * Local development server.
 * Uses @hono/node-server serve() to keep the process alive.
 *
 * Usage: bun run packages/core/src/dev-server.ts
 */

import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { MemoryStorage } from './memory-storage.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const storage = new MemoryStorage();
const app = createApp(storage);

serve(
    {
        fetch: app.fetch,
        port: PORT,
    },
    (info) => {
        console.log(`
  🤫 whisper dev server

  ➜ http://localhost:${info.port}
  ➜ API: http://localhost:${info.port}/api/health

  Using in-memory storage (secrets will be lost on restart)
  Press Ctrl+C to stop
`);
    },
);

/**
 * Local development server.
 * Uses native Bun.serve to keep the process alive.
 *
 * Usage: bun run packages/core/src/dev-server.ts
 */

import { createApp } from './app';
import { MemoryStorage } from './memory-storage';

const PORT = parseInt(process.env.PORT || '3000', 10);

const storage = new MemoryStorage();
const app = createApp(storage);

console.log(`
  🤫 whisper dev server

  ➜ http://localhost:${PORT}
  ➜ API: http://localhost:${PORT}/api/health

  Using in-memory storage (secrets will be lost on restart)
  Press Ctrl+C to stop
`);

export default {
    port: PORT,
    fetch: app.fetch,
};

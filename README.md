# Whisper

Anonymous end-to-end encrypted secret sharing. Encryption happens client-side — the server never sees your plaintext.

The decryption key lives exclusively in the URL fragment (`#`), which browsers never transmit to servers.

## Features

- **True E2EE** — AES-256-GCM encryption in the browser or CLI before anything leaves your device
- **Burn after reading** — auto-delete after the first view
- **View limits** — cap how many times a secret can be read
- **Password protection** — optional second layer via PBKDF2 key derivation
- **Expiry** — 5 minutes to 30 days
- **Cross-platform** — secrets created by the CLI can be decrypted in the web UI and vice versa
- **Dual interface** — web UI and a full-featured CLI

## How it works

```
Client                              Server
──────────────────────────────────  ─────────────────────
generateKey() → key                 (no plaintext ever)
encrypt(secret, key) → ciphertext
POST /api/secrets { ciphertext } ──▶ store(id, ciphertext)
                                 ◀── { id }
shareURL = https://host/#/s/<id>/<key>
                                     ↑ fragment never sent
```

When a recipient opens the URL, the browser extracts the key from the fragment locally, fetches the ciphertext, and decrypts it — all without the server learning the key.

## Packages

This repo is a Bun monorepo alongside a Go module.

| Package | Description |
|---|---|
| `packages/crypto` | `@whisper/crypto` — isomorphic AES-256-GCM library (Web Crypto API, no deps) |
| `packages/core` | `@whisper/core` — platform-agnostic Hono API factory + `StorageAdapter` interface |
| `platforms/vercel` | `@whisper/vercel` — Vercel Edge Function with Upstash Redis storage |
| `apps/web` | Next.js web UI |
| `cmd/whisper` | Go CLI (`create`, `get`, `delete`) |
| `internal/crypto` | Go AES-256-GCM + Base58, interoperable with `@whisper/crypto` |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Go](https://go.dev) ≥ 1.21 (for the CLI only)

### Run locally

```bash
# Install dependencies
bun install

# Start the API server (in-memory storage, port 3000)
bun run dev

# In a separate terminal, start the web UI (port 3001)
cd apps/web && bun run dev
```

Open [http://localhost:3001](http://localhost:3001).

### CLI

```bash
# Build
go build ./cmd/whisper

# Create a secret interactively
./whisper create

# Create from text or file
./whisper create --text "my secret"
./whisper create --file secret.txt
echo "my secret" | ./whisper create

# Retrieve a secret
./whisper get "https://host/#/s/<id>/<key>"

# Delete a secret
./whisper delete "https://host/#/s/<id>/<key>"
```

By default the CLI talks to `http://localhost:3000`. Override with `--server <url>` or `$WHISPER_URL`.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/secrets` | Create encrypted secret |
| `GET` | `/api/secrets/:id` | Retrieve (and optionally burn) secret |
| `DELETE` | `/api/secrets/:id` | Delete secret |

`POST /api/secrets` body:

```json
{
  "ciphertext": "<base64>",
  "iv": "<base64>",
  "salt": "<base64>",
  "expiresIn": "5m | 1h | 24h | 7d | 30d",
  "burnAfterReading": false,
  "maxViews": null,
  "hasPassword": false
}
```

## Deployment

### Vercel (recommended)

The `platforms/vercel` package deploys as a Vercel Edge Function backed by [Upstash Redis](https://upstash.com).

```bash
# From the repo root for local dev
vercel dev

# Deploy
cd platforms/vercel
vercel --prod
```

Required environment variables:

```
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### Custom storage backend

Implement the `StorageAdapter` interface from `@whisper/core` and pass it to `createApp`:

```ts
import { createApp } from "@whisper/core";

const app = createApp({
  save(id, data, ttlSeconds) { /* ... */ },
  get(id) { /* ... */ },
  delete(id) { /* ... */ },
});
```

## Development

```bash
# Type-check all packages
bun run typecheck

# Build (TypeScript project references)
bun run build

# Run all tests
bun test

# Run tests for a specific package
bun test packages/crypto

# Lint and format
bun run lint

# Go tests
go test ./...
```

CI runs on every push via GitHub Actions (`.github/workflows/ci.yml`).

## Security

- Encryption: AES-256-GCM, 256-bit key, 12-byte random IV
- Password KDF: PBKDF2-SHA256, 600,000 iterations, 16-byte random salt
- Key encoding: Base58 (Bitcoin alphabet, no ambiguous characters)
- Max payload: 1 MB
- The server stores only ciphertext, IV, and salt — never the key

If you find a security vulnerability, please disclose it responsibly by opening a private security advisory on GitHub rather than a public issue.

## License

MIT

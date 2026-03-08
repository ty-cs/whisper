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
- [Go](https://go.dev) ≥ 1.25 (for the CLI only)

### Run locally

```bash
# Install dependencies
bun install

# Start the API server (in-memory storage, port 4000)
bun run dev

# In a separate terminal, start the web UI (port 3001)
bun run dev:web
```

Open [http://localhost:3001](http://localhost:3001).

> **Note:** The CLI defaults to `http://localhost:3000`. When running against the local dev server, pass `--server http://localhost:4000` or set `WHISPER_API_URL=http://localhost:4000`.

## CLI

### Installation

**Using `go install`** (requires Go ≥ 1.25):

```bash
go install github.com/ty-cs/whisper/cmd/whisper@latest
```

**Build from source:**

```bash
git clone https://github.com/ty-cs/whisper.git
cd whisper
go build ./cmd/whisper
```

### Usage

```bash
# Create a secret interactively (TUI)
whisper create

# Create from text or file
whisper create --text "my secret"
whisper create --file secret.txt
echo "my secret" | whisper create

# Retrieve a secret
whisper get "https://host/#/s/<id>/<key>"

# Delete a secret
whisper delete "https://host/#/s/<id>/<key>"
```

### `create` flags

| Flag | Default | Description |
|---|---|---|
| `-t, --text` | — | Secret text (skips interactive prompt) |
| `-f, --file` | — | Read secret from a file |
| `-e, --expires` | `24h` | Expiry: `5m`, `1h`, `24h`, `7d`, `30d` |
| `--no-burn` | — | Disable burn-after-reading |
| `-m, --max-views` | `0` | Max view count (0 = unlimited; requires `--no-burn`) |
| `--password` | — | Password-protect the secret |
| `-q, --quiet` | — | Output only the URL |
| `-j, --json` | — | Output JSON |
| `-s, --server` | — | API server URL (overrides env and default) |

### `get` flags

| Flag | Description |
|---|---|
| `-p, --password` | Password for protected secrets |
| `-q, --quiet` | Output only the plaintext |
| `-j, --json` | Output JSON |

### Server resolution

The CLI resolves the API server in this order:

1. `--server <url>` flag
2. `$WHISPER_API_URL` environment variable
3. `http://localhost:3000` (default)

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
  "maxViews": 0,
  "hasPassword": false
}
```

### Response format

Every response includes a `code` field (`0` = success, non-zero = error).

**POST `/api/secrets`** (201):
```json
{ "code": 0, "id": "<nanoid>", "expiresAt": 1234567890, "burnAfterReading": false }
```

**GET `/api/secrets/:id`** (200):
```json
{ "code": 0, "ciphertext": "...", "iv": "...", "salt": "...", "burnAfterReading": false, "hasPassword": false, "expiresAt": 1234567890, "maxViews": 0, "viewCount": 1 }
```

**DELETE `/api/secrets/:id`** (200):
```json
{ "code": 0, "deleted": true }
```

**Error response**:
```json
{ "code": 1006, "error": "Secret not found or has expired" }
```

**Error codes**:

| Code | Meaning |
|------|---------|
| 0 | OK (success) |
| 1001 | Missing required fields |
| 1002 | Invalid `expiresIn` value |
| 1003 | Payload too large (> 1 MB) |
| 1004 | `maxViews` exceeds maximum (10,000) |
| 1005 | Conflicting options |
| 1006 | Secret not found or expired |
| 5000 | Internal server error |

## Deployment

### Vercel (recommended)

The `platforms/vercel` package deploys as a Vercel Edge Function backed by [Upstash Redis](https://upstash.com).

```bash
# Local dev — run from repo root (not platforms/vercel/)
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

# Build all packages
bun run build

# Run all tests (Vitest)
bun run test

# Lint and format
bun run lint
```

### Go

```bash
# Build the CLI binary
go build ./cmd/whisper

# Run all Go tests
go test ./...

# Run only internal package tests
go test -v ./internal/...
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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whisper is an anonymous end-to-end encrypted (E2EE) secret sharing tool. It has two independent components in one repo:

- **TypeScript monorepo** (Bun workspaces) — the API server and crypto library
- **Go module** — the CLI (`whisper` command)

Encryption always happens client-side. The server only ever stores ciphertext. The decryption key lives exclusively in the URL fragment (`#`), which browsers and servers never transmit.

## Commands

### TypeScript (Bun)

```bash
# Install dependencies
bun install

# Run dev server (in-memory storage, port 3000)
bun run dev

# Build all packages (TypeScript project references)
bun run build         # same as: tsc --build

# Type-check without emitting
bun run typecheck     # same as: tsc --build

# Run all tests
bun test

# Run tests for a specific package
bun test packages/crypto
bun test packages/core
```

### Go (CLI)

```bash
# Build the CLI binary
go build ./cmd/whisper

# Run tests
go test ./...

# Run the CLI directly
go run ./cmd/whisper create
go run ./cmd/whisper get <url>
```

## TypeScript Build Notes

This monorepo uses TypeScript **project references**. Always use `tsc --build` (not `tsc --noEmit`) when building. The `--noEmit` flag is incompatible with `--build` for project references. Type declarations in `packages/*/dist/` are generated outputs — do not edit them.

## Architecture

### TypeScript packages

```
packages/
  crypto/    @whisper/crypto — isomorphic AES-256-GCM library (Web Crypto API)
  core/      @whisper/core   — Hono API app factory + StorageAdapter interface

platforms/
  vercel/    @whisper/vercel — Vercel Edge Function using Upstash Redis storage
```

**`@whisper/crypto`** (`packages/crypto/src/index.ts`) — pure crypto utilities: `generateKey`, `encrypt`, `decrypt`, `deriveKeyFromPassword`, and Base58 encode/decode. Uses `globalThis.crypto` (Web Crypto), so it runs in browsers, Cloudflare Workers, Vercel Edge, and Node.js 20+. No dependencies.

**`@whisper/core`** (`packages/core/src/`) — platform-agnostic Hono API. `createApp(storage)` takes a `StorageAdapter` and returns a fully configured Hono app. The `StorageAdapter` interface (`storage.ts`) has three methods: `save`, `get`, `delete`. Adding a new platform means implementing this interface.

**`@whisper/vercel`** (`platforms/vercel/`) — wires `createApp` with `UpstashStorage` (Upstash Redis via HTTP). Entry point is `api/index.ts` as a Vercel Edge Function. Deploy with `vercel --prod` from `platforms/vercel/`.

> **Local dev:** Run `vercel dev` from the **repo root**, not from `platforms/vercel/`. The root `vercel.json` configures the correct routing for local development.

### Go module

```
cmd/whisper/         CLI entry point (cobra commands: create, get, version)
internal/crypto/     AES-256-GCM + Base58 — Go equivalent of @whisper/crypto
internal/api/        HTTP client for the Whisper API
```

The Go crypto (`internal/crypto`) is intentionally interoperable with `@whisper/crypto`: same algorithm (AES-256-GCM, 12-byte IV, base64 encoding), same Base58 alphabet (Bitcoin-style). Secrets created by the CLI can be decrypted by a web client and vice versa.

### URL format

Shareable URLs follow the pattern:
```
https://host/#/s/<SECRET_ID>/<BASE58_KEY>
```

The `#fragment` is never sent to the server. The CLI parses this in `cmd/whisper/get.go:parseWhisperURL`.

### API routes (`@whisper/core`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/secrets` | Create encrypted secret |
| GET | `/api/secrets/:id` | Retrieve (and optionally burn) secret |
| DELETE | `/api/secrets/:id` | Delete secret |

`POST /api/secrets` accepts `{ ciphertext, iv, salt, expiresIn, burnAfterReading?, maxViews?, hasPassword? }`. Valid `expiresIn` values: `5m`, `1h`, `24h`, `7d`, `30d`.

### CLI server resolution

The CLI resolves the API server in order: `--server` flag → `$WHISPER_URL` env var → `http://localhost:3000`.

# Whisper

Anonymous end-to-end encrypted (E2EE) secret sharing. Encryption happens client-side — the server never sees your plaintext. The decryption key lives exclusively in the URL fragment (`#`), which browsers and servers never transmit.

## Project Overview

Whisper is a multi-platform secret sharing tool consisting of:
- **TypeScript Monorepo**: An isomorphic crypto library, a platform-agnostic Hono API, and a Next.js web interface.
- **Go CLI**: A full-featured command-line interface for creating and retrieving secrets, with TUI support.

### Key Technologies
- **Frontend**: Next.js 16 (React 19), Tailwind CSS, TanStack Query, Anime.js.
- **Backend**: Hono (API Framework), Bun (Runtime), Vercel Edge Functions, Upstash Redis.
- **CLI**: Go 1.25, Cobra (CLI), Bubbletea (TUI), Lipgloss (Styling).
- **Security**: AES-256-GCM (client-side), PBKDF2 (optional password protection), Base58 encoding.

## Building and Running

### Prerequisites
- [Bun](https://bun.sh) >= 1.0
- [Go](https://go.dev) >= 1.25 (for CLI only)
- [Vercel CLI](https://vercel.com/docs/cli) (for local API development)

### TypeScript (Web & API)
```bash
# Install dependencies
bun install

# Run dev server (Core API on :4000 with in-memory storage)
bun run dev

# Run web UI dev server (on :3001)
# Note: Next.js dev server proxies /api/* requests to the API server.
bun run dev:web

# Build all packages (bundles @whisper/crypto and @whisper/core via tsdown)
bun run build

# Run tests
bun run test
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

### Local Development with Vercel
```bash
# Run the API as a Vercel Edge Function locally (port 3000)
# Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env
vercel dev
```

## Project Structure

### TypeScript Packages (`packages/`)
- `crypto/`: Isomorphic AES-256-GCM library using the Web Crypto API.
- `core/`: Hono API logic and `StorageAdapter` interface. Platform-agnostic.
- `apps/web/`: Next.js web application.
- `platforms/vercel/`: Implementation of `StorageAdapter` for Upstash Redis (Vercel Edge).

### Go Module
- `cmd/whisper/`: CLI entry point and commands (create, get, delete).
- `internal/api/`: HTTP client for communicating with the Whisper API.
- `internal/crypto/`: Go implementation of AES-256-GCM, interoperable with `@whisper/crypto`.
- `internal/ui/`: Bubbletea-based terminal user interfaces for the CLI.

## Development Conventions

### API Design
The API is a Hono application factory located in `packages/core/src/app.ts`. It takes a `StorageAdapter` to handle persistence.
- `POST /api/secrets`: Accepts `{ ciphertext, iv, expiresIn, burnAfterReading?, maxViews?, hasPassword? }`.
- `GET /api/secrets/:id`: Retrieves and consumes a secret (atomic decrement of view count or deletion).

### Security Standards
- **Client-side Encryption**: AES-256-GCM with a 12-byte random IV.
- **URL Format**: `https://<host>/s/<id>#<key>`. The key is Base58 encoded.
- **Interoperability**: The Go CLI and TypeScript crypto libraries are byte-for-byte compatible.
- **Zero-Knowledge Storage**: The server stores only the ciphertext, IV, and metadata (expiry, view limits). It never receives the decryption key or the password-derived key.

### Testing
- **Vitest**: Used for unit and integration testing of TypeScript packages.
- **Go Test**: Used for testing the Go CLI and internal packages.
- **Playwright**: Used for end-to-end testing of the web UI.

## Deployment
Whisper is designed to be deployed on Vercel:
1. Set environment variables for Upstash Redis.
2. Run `vercel --prod` from the `platforms/vercel/` directory or the root.

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
shareURL = https://host/s/<id>#<key>
                                    ↑ fragment never sent
```

When a recipient opens the URL, the browser extracts the key from the fragment locally, fetches the ciphertext, and decrypts it — all without the server learning the key.

## Getting started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Go](https://go.dev) ≥ 1.25 (for the CLI only)

### Run locally

```bash
# Install dependencies
bun install

# Start the API server (port 3000)
vercel dev

# In a separate terminal, start the web UI (port 3001)
bun run dev:web
```

Open [http://localhost:3001](http://localhost:3001).

> **Note:** The CLI defaults to `http://localhost:3001` (Next.js, which proxies `/api/*` to the API server). Local CLI dev requires both servers running: `vercel dev` (API on port 3000) and `bun run dev:web` (Next.js on port 3001).

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
whisper get "https://host/s/<id>#<key>"

# Delete a secret
whisper delete "https://host/s/<id>#<key>"
```

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

## Security

- Encryption: AES-256-GCM, 256-bit key, 12-byte random IV
- Password KDF: PBKDF2-SHA256, 600,000 iterations; the 32-byte URL fragment key (`urlKey`) serves as the salt — never transmitted to the server
- Key encoding: Base58 (Bitcoin alphabet, no ambiguous characters)
- Max payload: 1 MB (server); CLI stdin is capped at 512 KB
- The server stores only ciphertext and IV — never the key or password salt

If you find a security vulnerability, please disclose it responsibly by opening a private security advisory on GitHub rather than a public issue.

## License

MIT

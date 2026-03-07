# Whisper — Multi-Platform Secret Sharing App

## Phase 0: Shared Core
- [x] Project scaffolding (Go module + npm monorepo)
- [x] Crypto library — Go AES-256-GCM + Base58 (5 tests pass)
- [x] Storage adapter interface (TypeScript)
- [x] Hono API core (CRUD, burn-after-reading, TTL, max views)
- [x] In-memory storage adapter (dev/testing)
- [x] Local dev server (`@hono/node-server`)
- [x] Go CLI with Cobra (`create`, `get`, `version`)
- [x] Go Terminal UI (Bubbletea implementation begun)

## Phase 1.5: Web App Frontend
- [x] Next.js scaffold created (`apps/web`)
- [ ] Implement UI design for secret sharing
- [ ] Connect frontend to Hono API (or Vercel Edge)

## Phase 1: Vercel + Upstash Redis 🟢 NEXT
- [x] Upstash Redis storage adapter (written)
- [x] Vercel Edge Function entry point (written)
- [ ] Deploy to Vercel (use `.vercel.app` domain)
- [ ] Wire Upstash Redis credentials
- [ ] Verify E2EE flow on live URL

## Phase 2: Cloudflare Workers + KV
- [ ] Cloudflare KV storage adapter
- [ ] Wrangler config + deployment

## Phase 3: AWS Lambda + DynamoDB
- [ ] DynamoDB storage adapter
- [ ] SAM/CDK infra setup

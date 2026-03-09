# Whisper — Multi-Platform Secret Sharing App

## Phase 0: Shared Core
- [x] Project scaffolding (Go module + npm monorepo)
- [x] Crypto library — Go AES-256-GCM + Base58 (5 tests pass)
- [x] Storage adapter interface (TypeScript)
- [x] Hono API core (CRUD, burn-after-reading, TTL, max views)
- [x] In-memory storage adapter (dev/testing)
- [x] Local dev server (`Bun.serve`)
- [x] Go CLI with Cobra (`create`, `get`, `version`)
- [x] Go Terminal UI (Bubbletea implementation begun)

## Phase 1.5: Web App Frontend
- [x] Next.js scaffold created (`apps/web`)
- [ ] Implement UI design for secret sharing
- [ ] Connect frontend to Hono API (or Vercel Edge)

## Phase 1: Vercel + Upstash Redis ✅ DONE
- [x] Upstash Redis storage adapter (written)
- [x] Vercel Edge Function entry point (written)
- [x] Deploy to Vercel (use `.vercel.app` domain)
- [x] Wire Upstash Redis credentials
- [x] Verify E2EE flow on live URL

## Phase 2: Cloudflare Workers + KV
- [ ] Cloudflare KV storage adapter
- [ ] Wrangler config + deployment

## Phase 3: AWS Lambda + DynamoDB
- [ ] DynamoDB storage adapter
- [ ] SAM/CDK infra setup

## Phase 4: System Design & Evaluation
- [ ] Comparison between storage adapters (Redis, KV, DynamoDB)
- [ ] Evaluate scalability & latency across platforms
- [ ] Analyze consistency models (Eventual vs Strong) for burn-after-reading
- [ ] Document tradeoffs in cold starts & global distribution

## System Design Notes

### Upstash Redis — Consistency & Burn-After-Reading

**Current setup:** Single-region (`ap-southeast-1`), Global-type database, eviction disabled.

**Why burn-after-reading is safe despite "eventual consistency" label:**
- `consume()` uses a Redis Lua script (`EVAL`). Lua scripts containing write ops (`DEL`, `SET`) are always routed to the **primary** node by Upstash — even on Global databases.
- Because the entire script executes atomically on the primary, no two concurrent requests can both pass the burn check for the same key.
- The `GET` inside the Lua script also reads from the primary (same node, same execution context) — so there's no stale read risk within the script.

**What would change if read regions were added:**
- Regular `GET` calls (plain reads) would be served from the nearest replica → eventual consistency.
- However, `storage.get()` is **never called** by the API — all routes use `consume()`, `save()`, or `delete()`, which are all write operations routed to the primary.
- Therefore, adding read regions would not affect correctness for this app. `readYourWrites` is not needed.

**Eviction disabled — why:**
- With eviction ON: memory-full → secrets silently dropped → recipient gets a 404 with no explanation.
- With eviction OFF: memory-full → `save()` throws → API returns 500 → caller knows immediately the secret wasn't stored.
- Loud failure at write time is preferable to silent data loss.

**Key takeaway:** Atomicity guarantees from Lua `EVAL` travel with the write routing. If your critical path only uses write operations, eventual consistency in a multi-region setup is not a threat to correctness.


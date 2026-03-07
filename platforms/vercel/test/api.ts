/**
 * Integration tests for the Whisper API running under vercel dev.
 * Run with: bun test/api.ts [--url http://localhost:3000]
 */

const BASE = process.argv.includes('--url')
    ? process.argv[process.argv.indexOf('--url') + 1]
    : 'http://localhost:3000';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURE = {
    ciphertext: 'my-encrypted-secret-message',
    iv: 'initialization-vector',
    salt: 'password-salt',
    expiresIn: '1h',
} as const;

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
    if (!condition) throw new Error(msg);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${e instanceof Error ? e.message : e}`);
        failed++;
    }
}

async function suite(name: string, fn: () => Promise<void>): Promise<void> {
    console.log(`\n${name}`);
    await fn();
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function url(path: string): string {
    return `${BASE}${path}`;
}

async function post(path: string, body: unknown): Promise<Response> {
    return fetch(url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function createSecret(overrides: Record<string, unknown> = {}): Promise<string> {
    const res = await post('/api/secrets', { ...FIXTURE, ...overrides });
    const { id } = await res.json() as { id: string };
    return id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

await suite('Health', async () => {
    await test('GET /api/health returns 200 with status ok', async () => {
        const res = await fetch(url('/api/health'));
        assert(res.status === 200, `expected 200, got ${res.status}`);
        const body = await res.json() as { status: string };
        assert(body.status === 'ok', `expected status=ok, got ${body.status}`);
    });
});

await suite('Create secret', async () => {
    await test('POST /api/secrets returns 201 with id and expiresAt', async () => {
        const res = await post('/api/secrets', FIXTURE);
        assert(res.status === 201, `expected 201, got ${res.status}`);
        const body = await res.json() as { id: string; expiresAt: number };
        assert(typeof body.id === 'string' && body.id.length > 0, 'missing id');
        assert(typeof body.expiresAt === 'number', 'missing expiresAt');
    });

    await test('POST /api/secrets rejects missing fields', async () => {
        const res = await post('/api/secrets', { ciphertext: 'orphaned-ciphertext' });
        assert(res.status === 400, `expected 400, got ${res.status}`);
    });

    await test('POST /api/secrets rejects invalid expiresIn', async () => {
        const res = await post('/api/secrets', { ...FIXTURE, expiresIn: '999y' });
        assert(res.status === 400, `expected 400, got ${res.status}`);
    });

    await test('POST /api/secrets accepts all valid expiresIn values', async () => {
        for (const expiresIn of ['5m', '1h', '24h', '7d', '30d']) {
            const res = await post('/api/secrets', { ...FIXTURE, expiresIn });
            assert(res.status === 201, `expiresIn=${expiresIn}: expected 201, got ${res.status}`);
        }
    });
});

await suite('Retrieve secret', async () => {
    await test('GET /api/secrets/:id returns ciphertext, iv, salt', async () => {
        const id = await createSecret();
        const res = await fetch(url(`/api/secrets/${id}`));
        assert(res.status === 200, `expected 200, got ${res.status}`);
        const body = await res.json() as { ciphertext: string; iv: string; salt: string };
        assert(body.ciphertext === FIXTURE.ciphertext, 'ciphertext mismatch');
        assert(body.iv === FIXTURE.iv, 'iv mismatch');
        assert(body.salt === FIXTURE.salt, 'salt mismatch');
    });

    await test('GET /api/secrets/:id returns 404 for unknown id', async () => {
        const res = await fetch(url('/api/secrets/nonexistent-id-xyz'));
        assert(res.status === 404, `expected 404, got ${res.status}`);
    });

    await test('GET /api/secrets/:id increments viewCount (secret survives multiple reads)', async () => {
        const id = await createSecret();
        const r1 = await fetch(url(`/api/secrets/${id}`));
        assert(r1.status === 200, `read 1: expected 200, got ${r1.status}`);
        const r2 = await fetch(url(`/api/secrets/${id}`));
        assert(r2.status === 200, `read 2: expected 200, got ${r2.status}`);
    });
});

await suite('Burn after reading', async () => {
    await test('burnAfterReading=true: second read returns 404', async () => {
        const id = await createSecret({ ciphertext: 'self-destructing-secret-message', burnAfterReading: true });
        const r1 = await fetch(url(`/api/secrets/${id}`));
        assert(r1.status === 200, `first read: expected 200, got ${r1.status}`);
        const r2 = await fetch(url(`/api/secrets/${id}`));
        assert(r2.status === 404, `second read: expected 404, got ${r2.status}`);
    });
});

await suite('maxViews', async () => {
    await test('maxViews=2: third read returns 404', async () => {
        const id = await createSecret({ ciphertext: 'view-limited-secret-message', maxViews: 2 });
        const r1 = await fetch(url(`/api/secrets/${id}`));
        assert(r1.status === 200, `view 1: expected 200, got ${r1.status}`);
        const r2 = await fetch(url(`/api/secrets/${id}`));
        assert(r2.status === 200, `view 2: expected 200, got ${r2.status}`);
        const r3 = await fetch(url(`/api/secrets/${id}`));
        assert(r3.status === 404, `view 3: expected 404, got ${r3.status}`);
    });

    await test('maxViews=1 acts like burnAfterReading', async () => {
        const id = await createSecret({ ciphertext: 'one-time-secret-message', maxViews: 1 });
        assert((await fetch(url(`/api/secrets/${id}`))).status === 200, 'view 1 failed');
        assert((await fetch(url(`/api/secrets/${id}`))).status === 404, 'view 2 should be 404');
    });
});

await suite('Delete', async () => {
    await test('DELETE /api/secrets/:id removes the secret', async () => {
        const id = await createSecret({ ciphertext: 'secret-to-be-deleted' });
        const delRes = await fetch(url(`/api/secrets/${id}`), { method: 'DELETE' });
        assert(delRes.status === 200, `expected 200, got ${delRes.status}`);
        const body = await delRes.json() as { deleted: boolean };
        assert(body.deleted === true, 'expected deleted=true');
        const getRes = await fetch(url(`/api/secrets/${id}`));
        assert(getRes.status === 404, `after delete: expected 404, got ${getRes.status}`);
    });

    await test('DELETE /api/secrets/:id returns 404 for unknown id', async () => {
        const res = await fetch(url('/api/secrets/nonexistent-xyz'), { method: 'DELETE' });
        assert(res.status === 404, `expected 404, got ${res.status}`);
    });

    await test('DELETE /api/secrets/:id is idempotent (second delete returns 404)', async () => {
        const id = await createSecret({ ciphertext: 'secret-deleted-twice' });
        await fetch(url(`/api/secrets/${id}`), { method: 'DELETE' });
        const second = await fetch(url(`/api/secrets/${id}`), { method: 'DELETE' });
        assert(second.status === 404, `expected 404, got ${second.status}`);
    });
});

await suite('hasPassword', async () => {
    await test('hasPassword=true is returned in GET response', async () => {
        const id = await createSecret({ ciphertext: 'password-protected-secret-message', hasPassword: true });
        const body = await (await fetch(url(`/api/secrets/${id}`))).json() as { hasPassword: boolean };
        assert(body.hasPassword === true, `expected hasPassword=true, got ${body.hasPassword}`);
    });
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

/**
 * Integration tests for the Whisper API running under vercel dev.
 * Run with: bun test-api.ts [--url http://localhost:3000]
 */

const BASE = process.argv.includes('--url')
    ? process.argv[process.argv.indexOf('--url') + 1]
    : 'http://localhost:3000';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
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

function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
}

async function post(path: string, body: unknown) {
    return fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ── Health ────────────────────────────────────────────────────────────────────

console.log('\nHealth');

await test('GET /api/health returns 200 with status ok', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = await res.json() as { status: string };
    assert(body.status === 'ok', `expected status=ok, got ${body.status}`);
});

// ── Create secret ─────────────────────────────────────────────────────────────

console.log('\nCreate secret');

await test('POST /api/secrets returns 201 with id and expiresAt', async () => {
    const res = await post('/api/secrets', {
        ciphertext: 'my-encrypted-secret-message',
        iv: 'initialization-vector',
        salt: 'password-salt',
        expiresIn: '1h',
    });
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
    const res = await post('/api/secrets', {
        ciphertext: 'my-encrypted-secret-message', iv: 'initialization-vector', salt: 'password-salt', expiresIn: '999y',
    });
    assert(res.status === 400, `expected 400, got ${res.status}`);
});

await test('POST /api/secrets accepts all valid expiresIn values', async () => {
    for (const exp of ['5m', '1h', '24h', '7d', '30d']) {
        const res = await post('/api/secrets', {
            ciphertext: 'my-encrypted-secret-message', iv: 'initialization-vector', salt: 'password-salt', expiresIn: exp,
        });
        assert(res.status === 201, `expiresIn=${exp}: expected 201, got ${res.status}`);
    }
});

// ── Retrieve secret ───────────────────────────────────────────────────────────

console.log('\nRetrieve secret');

await test('GET /api/secrets/:id returns ciphertext, iv, salt', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'my-encrypted-secret-message', iv: 'initialization-vector', salt: 'password-salt', expiresIn: '1h',
    });
    const { id } = await createRes.json() as { id: string };

    const res = await fetch(`${BASE}/api/secrets/${id}`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = await res.json() as { ciphertext: string; iv: string; salt: string };
    assert(body.ciphertext === 'my-encrypted-secret-message', 'ciphertext mismatch');
    assert(body.iv === 'initialization-vector', 'iv mismatch');
    assert(body.salt === 'password-salt', 'salt mismatch');
});

await test('GET /api/secrets/:id returns 404 for unknown id', async () => {
    const res = await fetch(`${BASE}/api/secrets/nonexistent-id-xyz`);
    assert(res.status === 404, `expected 404, got ${res.status}`);
});

await test('GET /api/secrets/:id increments viewCount (secret survives multiple reads)', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'my-encrypted-secret-message', iv: 'initialization-vector', salt: 'password-salt', expiresIn: '1h',
    });
    const { id } = await createRes.json() as { id: string };

    const r1 = await fetch(`${BASE}/api/secrets/${id}`);
    assert(r1.status === 200, `read 1: expected 200, got ${r1.status}`);
    const r2 = await fetch(`${BASE}/api/secrets/${id}`);
    assert(r2.status === 200, `read 2: expected 200, got ${r2.status}`);
});

// ── Burn after reading ────────────────────────────────────────────────────────

console.log('\nBurn after reading');

await test('burnAfterReading=true: second read returns 404', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'self-destructing-secret-message', iv: 'initialization-vector', salt: 'password-salt',
        expiresIn: '1h', burnAfterReading: true,
    });
    const { id } = await createRes.json() as { id: string };

    const r1 = await fetch(`${BASE}/api/secrets/${id}`);
    assert(r1.status === 200, `first read: expected 200, got ${r1.status}`);

    const r2 = await fetch(`${BASE}/api/secrets/${id}`);
    assert(r2.status === 404, `second read: expected 404, got ${r2.status}`);
});

// ── maxViews ──────────────────────────────────────────────────────────────────

console.log('\nmaxViews');

await test('maxViews=2: third read returns 404', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'view-limited-secret-message', iv: 'initialization-vector', salt: 'password-salt',
        expiresIn: '1h', maxViews: 2,
    });
    const { id } = await createRes.json() as { id: string };

    const r1 = await fetch(`${BASE}/api/secrets/${id}`);
    assert(r1.status === 200, `view 1: expected 200, got ${r1.status}`);
    const r2 = await fetch(`${BASE}/api/secrets/${id}`);
    assert(r2.status === 200, `view 2: expected 200, got ${r2.status}`);
    const r3 = await fetch(`${BASE}/api/secrets/${id}`);
    assert(r3.status === 404, `view 3: expected 404, got ${r3.status}`);
});

await test('maxViews=1 acts like burnAfterReading', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'one-time-secret-message', iv: 'initialization-vector', salt: 'password-salt',
        expiresIn: '1h', maxViews: 1,
    });
    const { id } = await createRes.json() as { id: string };

    assert((await fetch(`${BASE}/api/secrets/${id}`)).status === 200, 'view 1 failed');
    assert((await fetch(`${BASE}/api/secrets/${id}`)).status === 404, 'view 2 should be 404');
});

// ── Delete ────────────────────────────────────────────────────────────────────

console.log('\nDelete');

await test('DELETE /api/secrets/:id removes the secret', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'secret-to-be-deleted', iv: 'initialization-vector', salt: 'password-salt', expiresIn: '1h',
    });
    const { id } = await createRes.json() as { id: string };

    const delRes = await fetch(`${BASE}/api/secrets/${id}`, { method: 'DELETE' });
    assert(delRes.status === 200, `expected 200, got ${delRes.status}`);
    const body = await delRes.json() as { deleted: boolean };
    assert(body.deleted === true, 'expected deleted=true');

    const getRes = await fetch(`${BASE}/api/secrets/${id}`);
    assert(getRes.status === 404, `after delete: expected 404, got ${getRes.status}`);
});

await test('DELETE /api/secrets/:id returns 404 for unknown id', async () => {
    const res = await fetch(`${BASE}/api/secrets/nonexistent-xyz`, { method: 'DELETE' });
    assert(res.status === 404, `expected 404, got ${res.status}`);
});

await test('DELETE /api/secrets/:id is idempotent (second delete returns 404)', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'secret-deleted-twice', iv: 'initialization-vector', salt: 'password-salt', expiresIn: '1h',
    });
    const { id } = await createRes.json() as { id: string };

    await fetch(`${BASE}/api/secrets/${id}`, { method: 'DELETE' });
    const second = await fetch(`${BASE}/api/secrets/${id}`, { method: 'DELETE' });
    assert(second.status === 404, `expected 404, got ${second.status}`);
});

// ── hasPassword flag ──────────────────────────────────────────────────────────

console.log('\nhasPassword');

await test('hasPassword=true is returned in GET response', async () => {
    const createRes = await post('/api/secrets', {
        ciphertext: 'password-protected-secret-message', iv: 'initialization-vector', salt: 'password-salt',
        expiresIn: '1h', hasPassword: true,
    });
    const { id } = await createRes.json() as { id: string };

    const body = await (await fetch(`${BASE}/api/secrets/${id}`)).json() as { hasPassword: boolean };
    assert(body.hasPassword === true, `expected hasPassword=true, got ${body.hasPassword}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

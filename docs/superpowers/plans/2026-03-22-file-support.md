# File & Image Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file and image upload/download support (up to 5 MB) to Whisper's web UI and CLI, encrypted end-to-end with zero server-side metadata leakage.

**Architecture:** All payloads — text and file — are wrapped in a structured JSON envelope `{"__w":1,"type":...}` before AES-256-GCM encryption. The server remains payload-agnostic; no schema changes. On decryption the envelope is parsed to determine render mode (textarea vs inline image vs download button). The Go CLI's existing `--file` flag is refactored from a raw-string passthrough to a proper binary envelope.

**Tech Stack:** TypeScript (Bun, vitest), Next.js 15, Hono, Go 1.22+, `@whisper/crypto`, `@whisper/core`, cobra CLI

---

## File Map

| File | Action | What changes |
|---|---|---|
| `packages/crypto/src/index.ts` | Modify | Add `WhisperPayload` type, `encryptPayload`, `decryptPayload` |
| `packages/crypto/src/index.test.ts` | Modify | Add tests for new payload functions |
| `packages/core/src/app.ts` | Modify | Raise `MAX_BODY_SIZE` from 1 MB to 7 MB |
| `apps/web/src/app/page.tsx` | Modify | TEXT/FILE mode toggle, drop zone, use `encryptPayload` |
| `apps/web/src/app/s/[id]/page.tsx` | Modify | Use `decryptPayload`, render images inline, files as download |
| `internal/crypto/crypto.go` | Modify | Add `WhisperPayload`, `EncryptPayload`, `DecryptPayload` |
| `internal/crypto/crypto_test.go` | Modify | Add tests for new Go payload functions |
| `cmd/whisper/create.go` | Modify | Refactor `--file` branch to use `EncryptPayload` via new `headlessCreateFile` |

---

## Task 1: `@whisper/crypto` — Payload envelope functions

**Files:**
- Modify: `packages/crypto/src/index.ts`
- Modify: `packages/crypto/src/index.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the bottom of `packages/crypto/src/index.test.ts`:

```typescript
import {
    // existing imports ...
    encryptPayload,
    decryptPayload,
} from './index.js';

describe('encryptPayload / decryptPayload', () => {
    it('roundtrips a text payload', async () => {
        const key = generateKey();
        const encrypted = await encryptPayload({ type: 'text', text: 'hello world' }, key);
        expect(encrypted.ciphertext).toBeDefined();
        const result = await decryptPayload(encrypted, key);
        expect(result).toEqual({ type: 'text', text: 'hello world' });
    });

    it('roundtrips a file payload', async () => {
        const key = generateKey();
        const data = new Uint8Array([1, 2, 3, 255, 0, 128]);
        const encrypted = await encryptPayload(
            { type: 'file', name: 'test.bin', mimeType: 'application/octet-stream', data },
            key,
        );
        const result = await decryptPayload(encrypted, key);
        expect(result.type).toBe('file');
        if (result.type === 'file') {
            expect(result.name).toBe('test.bin');
            expect(result.mimeType).toBe('application/octet-stream');
            expect(result.data).toEqual(data);
        }
    });

    it('decrypts a legacy plain-text secret (no envelope) as text', async () => {
        const key = generateKey();
        // Legacy secret: encrypted with the old `encrypt` function directly
        const legacy = await encrypt('legacy secret', key);
        const result = await decryptPayload(legacy, key);
        expect(result).toEqual({ type: 'text', text: 'legacy secret' });
    });

    it('fails decryption with the wrong key', async () => {
        const key1 = generateKey();
        const key2 = generateKey();
        const encrypted = await encryptPayload({ type: 'text', text: 'secret' }, key1);
        await expect(decryptPayload(encrypted, key2)).rejects.toThrow();
    });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
bun run test packages/crypto
```

Expected: FAIL — `encryptPayload is not a function` (or similar import error)

- [ ] **Step 3: Implement `WhisperPayload`, `encryptPayload`, `decryptPayload` in `packages/crypto/src/index.ts`**

Add after the `EncryptedPayload` interface (around line 12):

```typescript
export type WhisperPayload =
    | { type: 'text'; text: string }
    | { type: 'file'; name: string; mimeType: string; data: Uint8Array };

interface WhisperEnvelope {
    __w: 1;
    type: 'text' | 'file';
    text?: string;
    name?: string;
    mime?: string;
    data?: string; // base64-encoded file bytes
}
```

Add at the bottom of the file (before the `// --- Base64 helpers ---` section):

```typescript
/**
 * Encrypt a WhisperPayload (text or file) using AES-256-GCM.
 * All new secrets — text and file — go through this function.
 *
 * @param payload - The payload to encrypt
 * @param key - 256-bit key (32 bytes)
 */
export async function encryptPayload(
    payload: WhisperPayload,
    key: Uint8Array,
): Promise<EncryptedPayload> {
    let envelope: WhisperEnvelope;
    if (payload.type === 'text') {
        envelope = { __w: 1, type: 'text', text: payload.text };
    } else {
        envelope = {
            __w: 1,
            type: 'file',
            name: payload.name,
            mime: payload.mimeType,
            data: uint8ToBase64(payload.data),
        };
    }
    return encrypt(JSON.stringify(envelope), key);
}

/**
 * Decrypt an EncryptedPayload back to a WhisperPayload.
 * Handles both structured envelopes (new) and legacy plain-text secrets.
 *
 * @param encrypted - The encrypted payload
 * @param key - 256-bit key (32 bytes)
 */
export async function decryptPayload(
    encrypted: EncryptedPayload,
    key: Uint8Array,
): Promise<WhisperPayload> {
    const plaintext = await decrypt(encrypted, key);

    let parsed: unknown;
    try {
        parsed = JSON.parse(plaintext);
    } catch {
        // Legacy plain-text secret
        return { type: 'text', text: plaintext };
    }

    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('__w' in parsed) ||
        (parsed as WhisperEnvelope).__w !== 1
    ) {
        // JSON but no envelope marker — treat as legacy text
        return { type: 'text', text: plaintext };
    }

    const env = parsed as WhisperEnvelope;

    if (env.type === 'file') {
        return {
            type: 'file',
            name: env.name ?? 'file',
            mimeType: env.mime ?? 'application/octet-stream',
            data: base64ToUint8(env.data ?? ''),
        };
    }

    return { type: 'text', text: env.text ?? plaintext };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
bun run test packages/crypto
```

Expected: All tests PASS including the 4 new ones.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/src/index.ts packages/crypto/src/index.test.ts
git commit -m "feat(crypto): add WhisperPayload envelope with encryptPayload/decryptPayload"
```

---

## Task 2: `@whisper/core` — Raise body size limit

**Files:**
- Modify: `packages/core/src/app.ts:32`

- [ ] **Step 1: Update `MAX_BODY_SIZE`**

In `packages/core/src/app.ts`, change line 32:

```typescript
// Before:
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// After:
const MAX_BODY_SIZE = 7 * 1024 * 1024; // 7 MB — accommodates 5 MB file + base64 overhead
```

Also update the error message on line 130:

```typescript
// Before:
error: 'Payload too large. Maximum 1 MB.',

// After:
error: 'Payload too large. Maximum 7 MB.',
```

- [ ] **Step 2: Run core tests**

```bash
bun run test packages/core
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/app.ts
git commit -m "feat(core): raise MAX_BODY_SIZE to 7 MB for file payload support"
```

---

## Task 3: Web create page — file upload UI

**Files:**
- Modify: `apps/web/src/app/page.tsx`

The create page needs a TEXT/FILE mode toggle, a drop zone when in FILE mode, and must use `encryptPayload` instead of `encrypt` for all submissions.

- [ ] **Step 1: Update imports and add new state**

Replace the top of `apps/web/src/app/page.tsx`:

```typescript
'use client';

import { useMutation } from '@tanstack/react-query';
import {
  type WhisperPayload,
  deriveKeyFromPassword,
  encryptPayload,
  generateKey,
  uint8ToBase58,
} from '@whisper/crypto';
import { QRCodeSVG } from 'qrcode.react';
import type React from 'react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { createSecret } from '@/lib/api';
```

Replace the state declarations at the top of `Home()`:

```typescript
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expiresIn, setExpiresIn] = useState('24h');
  const [maxViews, setMaxViews] = useState<number>(0);
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [password, setPassword] = useState('');
  const [resultUrl, setResultUrl] = useState('');
```

- [ ] **Step 2: Update the mutation to use `encryptPayload`**

Replace the `createSecretMutation` `mutationFn`:

```typescript
  const createSecretMutation = useMutation({
    mutationFn: async () => {
      const urlKey = generateKey();
      let encryptionKey = urlKey;

      if (password) {
        encryptionKey = await deriveKeyFromPassword(password, urlKey);
      }

      let whisperPayload: WhisperPayload;
      if (mode === 'file' && selectedFile) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        whisperPayload = {
          type: 'file',
          name: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          data: new Uint8Array(arrayBuffer),
        };
      } else {
        whisperPayload = { type: 'text', text };
      }

      const encrypted = await encryptPayload(whisperPayload, encryptionKey);

      const data = await createSecret({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        expiresIn,
        burnAfterReading,
        maxViews,
        hasPassword: !!password,
      });

      return { id: data.id, urlKey };
    },
    onSuccess: (data) => {
      const keyStr = uint8ToBase58(data.urlKey);
      setResultUrl(`${window.location.origin}/s/${data.id}#${keyStr}`);
    },
  });
```

- [ ] **Step 3: Update `handleSubmit` validation**

Replace the `handleSubmit` function:

```typescript
  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (mode === 'text') {
      if (!text.trim()) return;
      const byteSize = new Blob([text]).size;
      if (byteSize > 700 * 1024) {
        toast.error('Payload too large. Maximum input size is 700 KB.');
        return;
      }
    } else {
      if (!selectedFile) return;
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast.error('FILE_TOO_LARGE. Maximum size is 5 MB.');
        return;
      }
    }

    createSecretMutation.mutate();
  };
```

Also update the "NEW_SECRET" button's onClick to reset file state:

```typescript
onClick={() => {
  setResultUrl('');
  setText('');
  setSelectedFile(null);
  setMode('text');
  setPassword('');
}}
```

- [ ] **Step 4: Add drop zone helper handlers**

Add these handlers inside `Home()`, after `handleSubmit`:

```typescript
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };
```

- [ ] **Step 5: Add the mode toggle and file input UI**

In the JSX form, replace the `[ INPUT STREAM ]` section (the `<div className="space-y-4 flex-1 flex flex-col ...">` block) with:

```tsx
        {/* Mode toggle */}
        <div className="flex border border-[var(--muted)] animate-fade-in-up delay-200">
          <button
            type="button"
            onClick={() => { setMode('text'); setSelectedFile(null); }}
            disabled={isPending}
            className={`flex-1 py-2.5 text-[10px] font-bold tracking-widest uppercase transition-all duration-100 ${
              mode === 'text'
                ? 'bg-[var(--foreground)] text-[#050505]'
                : 'text-[var(--muted-fg)] hover:text-[var(--foreground)]'
            }`}>
            [ TEXT ]
          </button>
          <div className="w-px bg-[var(--muted)]" />
          <button
            type="button"
            onClick={() => { setMode('file'); setText(''); }}
            disabled={isPending}
            className={`flex-1 py-2.5 text-[10px] font-bold tracking-widest uppercase transition-all duration-100 ${
              mode === 'file'
                ? 'bg-[var(--foreground)] text-[#050505]'
                : 'text-[var(--muted-fg)] hover:text-[var(--foreground)]'
            }`}>
            [ FILE ]
          </button>
        </div>

        {mode === 'text' ? (
          <div className="space-y-4 flex-1 flex flex-col animate-fade-in-up delay-300">
            <label
              htmlFor="text"
              className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
              [ INPUT STREAM ]
            </label>
            <textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="term-input flex-1 min-h-[300px] border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] p-8 resize-none leading-relaxed text-sm sm:text-base focus:bg-[var(--muted)]/10 appearance-none outline-none"
              placeholder="Type secret payload here..."
              disabled={isPending}
            />
          </div>
        ) : (
          <div className="space-y-4 flex-1 flex flex-col animate-fade-in-up delay-300">
            <label className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
              [ PAYLOAD ]
            </label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={isPending}
            />
            {selectedFile ? (
              <div className="border border-[var(--border)] flex items-center gap-4 px-5 py-4">
                <span className="text-2xl opacity-50">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)] truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-[10px] text-[var(--muted-fg)] uppercase tracking-wide mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB · {selectedFile.type || 'application/octet-stream'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  disabled={isPending}
                  className="text-[10px] font-bold tracking-widest uppercase text-red-500 border border-red-500 px-2.5 py-1 hover:bg-red-500 hover:text-[#050505] transition-colors">
                  CLEAR
                </button>
              </div>
            ) : (
              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                className={`flex-1 min-h-[300px] border border-dashed flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-[var(--foreground)] bg-[var(--muted)]/10'
                    : 'border-[var(--border)] hover:border-[var(--foreground)]'
                }`}
                onClick={() => fileInputRef.current?.click()}>
                <span className="text-3xl opacity-30">⬆</span>
                <div className="text-center">
                  <p className="text-[11px] font-bold tracking-widest uppercase text-[var(--foreground)]">
                    Drop file here
                  </p>
                  <p className="text-[10px] text-[var(--muted-fg)] uppercase tracking-wide mt-1">
                    Images, PDFs, archives · Max 5 MB
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[10px] font-bold tracking-widest uppercase text-[var(--muted-fg)] border border-[var(--muted)] px-4 py-2 hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors">
                  &gt; BROWSE_FILES
                </button>
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 6: Update the ENCRYPT button disabled condition**

```typescript
// Before:
disabled={isPending || !text.trim()}

// After:
disabled={isPending || (mode === 'text' ? !text.trim() : !selectedFile)}
```

Also update the opacity/cursor class in the button:

```typescript
// Before:
${!isPending && !text.trim() ? 'opacity-30 cursor-not-allowed border-(--border)' : ''}

// After:
${!isPending && (mode === 'text' ? !text.trim() : !selectedFile) ? 'opacity-30 cursor-not-allowed border-(--border)' : ''}
```

- [ ] **Step 7: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): add file upload mode with TEXT/FILE toggle and drop zone"
```

---

## Task 4: Web view page — render file payloads

**Files:**
- Modify: `apps/web/src/app/s/[id]/page.tsx`

- [ ] **Step 1: Update imports**

Replace the crypto import line:

```typescript
// Before:
import { base58ToUint8, decrypt, deriveKeyFromPassword } from '@whisper/crypto';

// After:
import {
  type WhisperPayload,
  base58ToUint8,
  decryptPayload,
  deriveKeyFromPassword,
} from '@whisper/crypto';
```

- [ ] **Step 2: Replace `decryptedText` state with `decryptedPayload`**

```typescript
// Before:
const [decryptedText, setDecryptedText] = useState('');

// After:
const [decryptedPayload, setDecryptedPayload] = useState<WhisperPayload | null>(null);
```

- [ ] **Step 3: Update the decrypt mutation**

Replace the `decryptMutation` mutationFn and handlers:

```typescript
  const decryptMutation = useMutation({
    mutationFn: async ({
      payloadData,
      pass,
    }: {
      payloadData: GetSecretResponse;
      pass: string;
    }) => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) throw new Error('Encryption key not found in URL.');

      const urlKey = base58ToUint8(hash);
      let finalKey = urlKey;

      if (payloadData.hasPassword) {
        if (!pass) throw new Error('Password is required.');
        finalKey = await deriveKeyFromPassword(pass, urlKey);
      }

      return await decryptPayload(
        { ciphertext: payloadData.ciphertext, iv: payloadData.iv },
        finalKey,
      );
    },
    onSuccess: (result) => {
      setDecryptedPayload(result);
      setDecryptionError('');
    },
    onError: (err: Error) => {
      console.error('[onError] Decryption error:', err);
      if (
        err.name === 'OperationError' ||
        err.message.includes('password') ||
        err.message.includes('key')
      ) {
        setDecryptionError(
          'Decryption failed. Incorrect password or invalid key.',
        );
      } else {
        setDecryptionError('Decryption failed.');
      }
    },
  });
```

- [ ] **Step 4: Update the auto-decrypt effect**

```typescript
// Before:
  useEffect(() => {
    if (
      payload &&
      !payload.hasPassword &&
      !decryptedText &&
      ...
    ) {

// After:
  useEffect(() => {
    if (
      payload &&
      !payload.hasPassword &&
      !decryptedPayload &&
      ...
    ) {
```

- [ ] **Step 5: Replace the decrypted content render block**

Find the block starting `if (decryptedText) {` and replace the entire block with:

```tsx
  if (decryptedPayload) {
    const isDestroyed =
      payload.burnAfterReading ||
      (payload.maxViews > 0 && payload.viewCount >= payload.maxViews) ||
      timeLeft === EXPIRED_SENTINEL;

    const handleDownload = (fp: Extract<WhisperPayload, { type: 'file' }>) => {
      const blob = new Blob([fp.data], { type: fp.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fp.name;
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="flex-1 flex flex-col animate-fade-in w-full font-mono">
        <div className="w-full flex-1 flex flex-col relative space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--muted)] pb-4 animate-fade-in-up delay-300">
            <h2 className="text-sm font-bold tracking-widest uppercase text-[var(--foreground)] flex items-center gap-2">
              <span className="animate-blink">&gt;</span> DECRYPTED
            </h2>
            <div className="flex items-center gap-2 pr-2 sm:pr-0">
              {isDestroyed ? (
                <span className="px-3 py-1 bg-[var(--background)] border border-red-500 text-red-500 text-[10px] font-bold tracking-widest uppercase animate-blink">
                  DESTROYED
                </span>
              ) : timeLeft ? (
                <span className="px-3 py-1 bg-[var(--background)] border border-[var(--muted)] text-[var(--muted-fg)] text-[10px] font-bold tracking-widest uppercase">
                  TTL: {timeLeft}
                </span>
              ) : null}
            </div>
          </div>

          {decryptedPayload.type === 'text' ? (
            <textarea
              readOnly
              value={decryptedPayload.text}
              className="w-full bg-transparent border border-[var(--border)] outline-none p-6 flex-1 min-h-[350px] resize-none leading-relaxed text-[var(--foreground)] text-sm sm:text-base animate-fade-in-up delay-400"
            />
          ) : decryptedPayload.mimeType.startsWith('image/') ? (
            <div className="border border-[var(--border)] animate-fade-in-up delay-400">
              <div className="bg-[var(--muted)]/20 px-4 py-2.5 border-b border-[var(--border)] text-[10px] font-bold tracking-widest text-[var(--muted-fg)] uppercase">
                [ FILE: {decryptedPayload.name} · {(decryptedPayload.data.length / 1024).toFixed(1)} KB · {decryptedPayload.mimeType} ]
              </div>
              <div className="flex items-center justify-center p-6">
                {/* biome-ignore lint/performance/noAccumulatingSpread: <img src> built from blob> */}
                <img
                  src={URL.createObjectURL(
                    new Blob([decryptedPayload.data], { type: decryptedPayload.mimeType }),
                  )}
                  alt={decryptedPayload.name}
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="border border-[var(--border)] animate-fade-in-up delay-400">
              <div className="bg-[var(--muted)]/20 px-4 py-2.5 border-b border-[var(--border)] text-[10px] font-bold tracking-widest text-[var(--muted-fg)] uppercase">
                [ FILE: {decryptedPayload.name} · {(decryptedPayload.data.length / 1024).toFixed(1)} KB · {decryptedPayload.mimeType} ]
              </div>
              <div className="flex flex-col items-center justify-center gap-3 p-12">
                <span className="text-4xl opacity-30">📄</span>
                <p className="text-sm font-bold text-[var(--foreground)]">{decryptedPayload.name}</p>
                <p className="text-[10px] text-[var(--muted-fg)] uppercase tracking-wide">
                  {(decryptedPayload.data.length / 1024).toFixed(1)} KB · {decryptedPayload.mimeType}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-4 pt-4 border-t border-[var(--muted)] animate-fade-in-up delay-500">
            {decryptedPayload.type === 'text' ? (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(decryptedPayload.text);
                  toast.success('COPIED_TO_CLIPBOARD');
                }}
                className="term-btn w-full sm:w-auto text-sm py-3 px-6 flex items-center justify-center gap-2 group/btn">
                <span className="group-hover/btn:translate-x-1 transition-transform">-&gt;</span>{' '}
                COPY_CONTENTS
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleDownload(decryptedPayload)}
                className="term-btn w-full sm:w-auto text-sm py-3 px-6 flex items-center justify-center gap-2 group/btn">
                <span className="group-hover/btn:translate-x-1 transition-transform">-&gt;</span>{' '}
                DOWNLOAD_FILE
              </button>
            )}

            {isDestroyed ? (
              <Link
                href="/"
                className="term-btn w-full sm:w-auto text-sm py-3 px-6 text-center flex items-center justify-center gap-2 group/btn">
                <span className="group-hover/btn:translate-x-1 transition-transform">-&gt;</span>{' '}
                RETURN_TO_BASE
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="term-btn w-full sm:w-auto text-sm py-3 px-6 text-center !text-red-500 !border-red-500 hover:!bg-red-500 hover:!text-[#050505] flex items-center justify-center gap-2 group/btn disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="group-hover/btn:translate-x-1 transition-transform">-&gt;</span>{' '}
                {deleteMutation.isPending ? 'DESTROYING...' : 'DESTROY_AND_LEAVE'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
```

> **Note on the inline `URL.createObjectURL` call:** This creates a new object URL on every render. For a read-only view page this is acceptable, but if you notice memory warnings in dev tools you can hoist it with `useMemo`. The URL is short-lived since the page is not a long-lived SPA route.

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/s/[id]/page.tsx
git commit -m "feat(web): render file payloads — inline image preview and download button"
```

---

## Task 5: Go crypto — payload envelope

**Files:**
- Modify: `internal/crypto/crypto.go`
- Modify: `internal/crypto/crypto_test.go`

- [ ] **Step 1: Write failing tests**

Add to `internal/crypto/crypto_test.go`:

```go
import (
    "bytes"
    "testing"
)

func TestEncryptDecryptPayloadText(t *testing.T) {
    key, err := GenerateKey()
    if err != nil {
        t.Fatalf("GenerateKey failed: %v", err)
    }

    original := &WhisperPayload{Type: "text", Text: "hello world"}
    encrypted, err := EncryptPayload(original, key)
    if err != nil {
        t.Fatalf("EncryptPayload failed: %v", err)
    }

    result, err := DecryptPayload(encrypted, key)
    if err != nil {
        t.Fatalf("DecryptPayload failed: %v", err)
    }

    if result.Type != "text" || result.Text != "hello world" {
        t.Errorf("unexpected result: %+v", result)
    }
}

func TestEncryptDecryptPayloadFile(t *testing.T) {
    key, err := GenerateKey()
    if err != nil {
        t.Fatalf("GenerateKey failed: %v", err)
    }

    data := []byte{1, 2, 3, 255, 0, 128}
    original := &WhisperPayload{
        Type:     "file",
        Name:     "test.bin",
        MimeType: "application/octet-stream",
        Data:     data,
    }
    encrypted, err := EncryptPayload(original, key)
    if err != nil {
        t.Fatalf("EncryptPayload failed: %v", err)
    }

    result, err := DecryptPayload(encrypted, key)
    if err != nil {
        t.Fatalf("DecryptPayload failed: %v", err)
    }

    if result.Type != "file" {
        t.Fatalf("expected type=file, got %q", result.Type)
    }
    if result.Name != "test.bin" {
        t.Errorf("expected name=test.bin, got %q", result.Name)
    }
    if result.MimeType != "application/octet-stream" {
        t.Errorf("expected mime=application/octet-stream, got %q", result.MimeType)
    }
    if !bytes.Equal(result.Data, data) {
        t.Errorf("data mismatch: got %v, want %v", result.Data, data)
    }
}

func TestDecryptPayloadLegacy(t *testing.T) {
    key, err := GenerateKey()
    if err != nil {
        t.Fatalf("GenerateKey failed: %v", err)
    }

    // Legacy secret: encrypted with Encrypt (no envelope)
    legacy, err := Encrypt("legacy secret", key)
    if err != nil {
        t.Fatalf("Encrypt failed: %v", err)
    }

    result, err := DecryptPayload(legacy, key)
    if err != nil {
        t.Fatalf("DecryptPayload failed: %v", err)
    }

    if result.Type != "text" || result.Text != "legacy secret" {
        t.Errorf("unexpected result: %+v", result)
    }
}
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
go test ./internal/crypto/
```

Expected: FAIL — `WhisperPayload undefined`, `EncryptPayload undefined`

- [ ] **Step 3: Implement in `internal/crypto/crypto.go`**

Add the following imports (update the existing import block):

```go
import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "encoding/json"
    "errors"
    "math/big"

    "golang.org/x/crypto/pbkdf2"
)
```

Add after the `EncryptedPayload` struct:

```go
// WhisperPayload is the decrypted content of a Whisper secret.
// Type is "text" or "file".
type WhisperPayload struct {
    Type     string // "text" or "file"
    Text     string // non-empty for type=text
    Name     string // filename for type=file
    MimeType string // MIME type for type=file
    Data     []byte // raw file bytes for type=file
}

// whisperEnvelope is the JSON structure encrypted inside the ciphertext.
type whisperEnvelope struct {
    W    int    `json:"__w"`
    Type string `json:"type"`
    Text string `json:"text,omitempty"`
    Name string `json:"name,omitempty"`
    Mime string `json:"mime,omitempty"`
    Data string `json:"data,omitempty"` // base64-encoded file bytes
}
```

Add after `EncryptWithKey`:

```go
// EncryptPayload encrypts a WhisperPayload (text or file) into the structured envelope format.
// The envelope is JSON-serialised and then encrypted with AES-256-GCM.
// This format is interoperable with @whisper/crypto's encryptPayload.
func EncryptPayload(payload *WhisperPayload, key []byte) (*EncryptedPayload, error) {
    env := whisperEnvelope{W: 1, Type: payload.Type}
    switch payload.Type {
    case "text":
        env.Text = payload.Text
    case "file":
        env.Name = payload.Name
        env.Mime = payload.MimeType
        env.Data = base64.StdEncoding.EncodeToString(payload.Data)
    default:
        return nil, errors.New("unknown payload type: " + payload.Type)
    }

    jsonBytes, err := json.Marshal(env)
    if err != nil {
        return nil, err
    }
    return Encrypt(string(jsonBytes), key)
}

// DecryptPayload decrypts an EncryptedPayload and parses the WhisperPayload envelope.
// If the decrypted plaintext is not a valid envelope (legacy secret), it is returned
// as a text payload for backward compatibility.
func DecryptPayload(encrypted *EncryptedPayload, key []byte) (*WhisperPayload, error) {
    plaintext, err := Decrypt(encrypted, key)
    if err != nil {
        return nil, err
    }

    var env whisperEnvelope
    if jsonErr := json.Unmarshal([]byte(plaintext), &env); jsonErr != nil || env.W != 1 {
        // Legacy plain-text secret
        return &WhisperPayload{Type: "text", Text: plaintext}, nil
    }

    switch env.Type {
    case "file":
        data, err := base64.StdEncoding.DecodeString(env.Data)
        if err != nil {
            return nil, errors.New("invalid file data encoding in envelope")
        }
        mime := env.Mime
        if mime == "" {
            mime = "application/octet-stream"
        }
        return &WhisperPayload{
            Type:     "file",
            Name:     env.Name,
            MimeType: mime,
            Data:     data,
        }, nil
    default:
        return &WhisperPayload{Type: "text", Text: env.Text}, nil
    }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
go test ./internal/crypto/
```

Expected: All tests PASS including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add internal/crypto/crypto.go internal/crypto/crypto_test.go
git commit -m "feat(crypto/go): add WhisperPayload envelope with EncryptPayload/DecryptPayload"
```

---

## Task 6: CLI — refactor `--file` to use envelope

**Files:**
- Modify: `cmd/whisper/create.go`

The current `--file` path reads the file and coerces it to `string(data)`, which corrupts binary content. This task replaces that with a proper `headlessCreateFile` function that uses `EncryptPayload`.

- [ ] **Step 1: Add `path/filepath` and `mime`/`net/http` imports**

Update the import block in `cmd/whisper/create.go`:

```go
import (
    "encoding/json"
    "fmt"
    "io"
    "mime"
    "net/http"
    "os"
    "path/filepath"
    "strings"

    "github.com/ty-cs/whisper/internal/api"
    "github.com/ty-cs/whisper/internal/crypto"
    createUI "github.com/ty-cs/whisper/internal/ui/create"

    tea "github.com/charmbracelet/bubbletea"
    "github.com/spf13/cobra"
)
```

- [ ] **Step 2: Add `detectMIME` helper**

Add this function near the bottom of `cmd/whisper/create.go` (after `isTerminalStdin`):

```go
// detectMIME returns the MIME type for a file. It tries the file extension first,
// falls back to content sniffing, and finally returns "application/octet-stream".
func detectMIME(filename string, data []byte) string {
    if ext := filepath.Ext(filename); ext != "" {
        if t := mime.TypeByExtension(ext); t != "" {
            return t
        }
    }
    t := http.DetectContentType(data)
    return t // always returns a valid type (default: application/octet-stream)
}
```

- [ ] **Step 3: Add `headlessCreateFile` function**

Add after `headlessCreate`:

```go
func headlessCreateFile(client *api.Client, data []byte, filename, expiresIn string, burnAfterReading bool, maxViews int, password string, jsonOutput bool) error {
    mimeType := detectMIME(filename, data)

    urlKey, err := crypto.GenerateKey()
    if err != nil {
        return fmt.Errorf("generating key: %w", err)
    }

    encryptionKey := urlKey
    hasPassword := false

    if password != "" {
        derived, err := crypto.DeriveKeyFromPassword(password, urlKey)
        if err != nil {
            return fmt.Errorf("deriving key: %w", err)
        }
        encryptionKey = derived
        hasPassword = true
    }

    whisperPayload := &crypto.WhisperPayload{
        Type:     "file",
        Name:     filename,
        MimeType: mimeType,
        Data:     data,
    }

    payload, err := crypto.EncryptPayload(whisperPayload, encryptionKey)
    if err != nil {
        return fmt.Errorf("encrypting: %w", err)
    }

    mv := maxViews
    if burnAfterReading {
        mv = 1
    }

    req := &api.CreateRequest{
        Ciphertext:       payload.Ciphertext,
        IV:               payload.IV,
        ExpiresIn:        expiresIn,
        BurnAfterReading: burnAfterReading,
        MaxViews:         mv,
        HasPassword:      hasPassword,
    }

    resp, err := client.CreateSecret(req)
    if err != nil {
        return err
    }

    base58Key := crypto.KeyToBase58(urlKey)
    finalURL := fmt.Sprintf("%s/s/%s#%s", client.BaseURL, resp.ID, base58Key)

    if jsonOutput {
        out, _ := json.Marshal(map[string]interface{}{
            "url":       finalURL,
            "id":        resp.ID,
            "expiresAt": resp.ExpiresAt,
        })
        fmt.Println(string(out))
    } else {
        fmt.Println(finalURL)
    }
    return nil
}
```

- [ ] **Step 4: Refactor the `fileChanged` branch in `runCreate`**

Replace the `fileChanged` block (lines ~119–131) in `runCreate`:

```go
    // Before:
    } else if fileChanged {
        data, err := os.ReadFile(file)
        if err != nil {
            if os.IsNotExist(err) {
                return fmt.Errorf("file not found: %s", file)
            }
            if os.IsPermission(err) {
                return fmt.Errorf("permission denied: %s", file)
            }
            return fmt.Errorf("reading file: %w", err)
        }
        initialText = string(data)
        autoSubmit = true
    }
```

```go
    // After:
    } else if fileChanged {
        data, err := os.ReadFile(file)
        if err != nil {
            if os.IsNotExist(err) {
                return fmt.Errorf("file not found: %s", file)
            }
            if os.IsPermission(err) {
                return fmt.Errorf("permission denied: %s", file)
            }
            return fmt.Errorf("reading file: %w", err)
        }
        // File payloads always bypass the TUI — use headlessCreateFile directly.
        client := api.NewClient(baseURL)
        return headlessCreateFile(client, data, filepath.Base(file), expires, burnAfterReading, maxViews, password, jsonOutput)
    }
```

- [ ] **Step 5: Run Go tests**

```bash
go test ./...
```

Expected: All tests PASS.

- [ ] **Step 6: Build the CLI to confirm it compiles**

```bash
go build ./cmd/whisper
```

Expected: Binary produced with no errors.

- [ ] **Step 7: Commit**

```bash
git add cmd/whisper/create.go
git commit -m "feat(cli): refactor --file to use binary-safe WhisperPayload envelope"
```

---

## Task 7: End-to-end smoke test

Manual verification that the full flow works before calling it done.

- [ ] **Step 1: Start the dev server**

```bash
bun run dev
```

Server starts on port 4000 (API) + Next.js on its port.

- [ ] **Step 2: Web — create a text secret**

Open the web UI. Confirm TEXT mode is the default. Create a text secret. Open the result URL — confirm it displays in the textarea as before.

- [ ] **Step 3: Web — create an image secret**

Switch to FILE mode. Drop a PNG or JPG under 5 MB. Encrypt it. Open the result URL — confirm the image renders inline with the filename/size header and a DOWNLOAD_FILE button.

- [ ] **Step 4: Web — create a non-image file secret**

Upload a PDF or ZIP. Open the result URL — confirm the file icon view with DOWNLOAD_FILE button (no inline preview).

- [ ] **Step 5: CLI — create a file secret and retrieve via web**

```bash
go run ./cmd/whisper create --file /path/to/test.png --quiet
# Outputs: https://localhost:4000/s/<id>#<key>
```

Open the URL in the browser — confirm the image renders correctly (proves cross-client interoperability of the envelope format).

- [ ] **Step 6: Run the full test suite**

```bash
bun run test
go test ./...
```

Expected: All tests PASS.

- [ ] **Step 7: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: file support smoke test cleanup"
```

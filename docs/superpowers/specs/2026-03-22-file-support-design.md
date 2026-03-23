# File & Image Support Design

**Date:** 2026-03-22
**Status:** Approved
**Scope:** Add file and image upload/download to Whisper (web + CLI), encrypted client-side, zero server-side metadata leakage.

---

## Overview

Extend Whisper to support arbitrary file payloads (images, PDFs, archives, etc.) up to 5 MB, encrypted end-to-end using the same AES-256-GCM pipeline as text secrets. The server remains payload-agnostic — it stores only ciphertext and never learns the file name, MIME type, or content.

---

## Goals

- Support any file type up to 5 MB on both the web UI and CLI
- Zero changes to the server's zero-knowledge model (no plaintext metadata stored)
- Backward compatible — existing text secrets continue to work without any migration
- Inline image preview on the view page; download-only for non-image files

---

## Non-Goals

- Files larger than 5 MB
- Server-side virus scanning or content inspection
- In-browser file preview for PDFs or other non-image types
- Syntax-highlighted code snippets (separate feature)

---

## Architecture

### Crypto envelope format

The plaintext encrypted by AES-256-GCM is extended from a raw string to a structured JSON envelope:

```json
{ "__w": 1, "type": "file", "name": "photo.jpg", "mime": "image/jpeg", "data": "<base64>" }
```

- `__w` — version/magic marker. Presence of this key identifies a structured payload vs a legacy plain-text secret.
- `type` — `"text"` or `"file"`.
- `name` — original filename (file payloads only).
- `mime` — MIME type string (file payloads only).
- `data` — base64-encoded raw file bytes (file payloads only).

**Size budget:** 5 MB binary → ~6.7 MB base64 + JSON overhead → ~7 MB max ciphertext. Well within Upstash Redis value limits.

**Text envelopes:** New text secrets created via the web UI or CLI will also be wrapped in the structured envelope (`{ "__w": 1, "type": "text", "text": "..." }`). This means `encryptPayload` is used for all new secrets regardless of type.

**Backward compatibility:** `decryptPayload` calls the existing `decrypt` function, then tries to `JSON.parse` the result and checks for the presence of the `__w` key. If the key is absent or parsing fails, the output is treated as a legacy plain-text string and returned as `{ type: 'text', text: <result> }`. Checking for the key (not a string prefix) avoids fragility around whitespace in JSON serialisation.

### `@whisper/crypto` changes

Add a `WhisperPayload` union type and two new public functions. Existing `encrypt`/`decrypt` are unchanged.

```ts
export type WhisperPayload =
  | { type: 'text'; text: string }
  | { type: 'file'; name: string; mimeType: string; data: Uint8Array }

export async function encryptPayload(
  payload: WhisperPayload,
  key: Uint8Array,
): Promise<EncryptedPayload>

export async function decryptPayload(
  encrypted: EncryptedPayload,
  key: Uint8Array,
): Promise<WhisperPayload>
```

`encryptPayload` serialises the payload to the JSON envelope (base64-encoding `data` for file payloads), then calls the existing `encrypt` with the JSON string.

`decryptPayload` calls `decrypt`, then parses the result: if `__w` is present, deserialises the file envelope (base64-decoding `data` back to `Uint8Array`); otherwise returns `{ type: 'text', text: result }`.

### `@whisper/core` changes

- Raise `MAX_BODY_SIZE` in `packages/core/src/app.ts` from its current value of `1024 * 1024` (1 MB) to `7 * 1024 * 1024` (7 MB) to accommodate the base64 overhead of a 5 MB file. This constant is enforced at request time and will reject file payloads with a 413 if not updated. No API schema changes are required — the server is otherwise payload-agnostic.

### Web — create page (`apps/web/src/app/page.tsx`)

Add a **TEXT / FILE mode toggle** above the input area.

- **TEXT mode** (default): existing `<textarea>` unchanged.
- **FILE mode**: textarea is replaced by a dashed drop zone accepting drag-and-drop or a `BROWSE_FILES` button. Once a file is selected, the drop zone is replaced by a selected-file row showing filename, size, and a `CLEAR` button.
- The two modes are mutually exclusive. Only one payload is submitted.
- **Size validation (client-side):** text → 700 KB limit (unchanged); file → 5 MB limit. Exceeding the limit shows a toast error and prevents submission.
- On submit, `encryptPayload` is called with the appropriate payload type.

### Web — view page (`apps/web/src/app/s/[id]/page.tsx`)

After decryption, `decryptPayload` returns a `WhisperPayload`. Render based on `type`:

- **`type: 'text'`**: existing `<textarea readOnly>` display — no change.
- **`type: 'file'`, image MIME (`image/*`)**: show inline `<img>` inside a contained box with a metadata header bar (filename · size · MIME type). Action buttons: `DOWNLOAD_FILE` and `DESTROY_AND_LEAVE`.
- **`type: 'file'`, non-image**: show file icon, filename, size. Action buttons: `DOWNLOAD_FILE` (primary/prominent) and `DESTROY_AND_LEAVE`.

Download is implemented via a programmatic `<a download>` with an object URL created from the decrypted `Uint8Array`.

### CLI (`cmd/whisper/create.go`)

The `--file <path>` flag already exists and is partially implemented — it reads file bytes but passes them as a raw string through the existing text path (no JSON envelope). This work **refactors** the existing implementation rather than adding a new flag.

- The flag declaration and mutual-exclusion logic (conflict with `--text` and stdin) already exist and do not need to change.
- The refactor: replace the current `initialText = string(data)` path with proper envelope construction: `{ "__w": 1, "type": "file", "name": "<filename>", "mime": "<detected MIME>", "data": "<base64>" }`, then encrypt with the existing Go AES-256-GCM implementation in `internal/crypto`.
- The Go envelope format must mirror the TypeScript format exactly (`__w`, `type`, `name`, `mime`, `data`) to ensure cross-client interoperability — a file encrypted by the CLI must be decryptable by the web client and vice versa.
- MIME type detection: use `mime.TypeByExtension(filepath.Ext(name))` first; fall back to `net/http.DetectContentType` on the first 512 bytes of the file; fall back to `"application/octet-stream"` if neither yields a result.
- File not found or read errors exit with a clear message and non-zero status code (existing behaviour, unchanged).

---

## Data Flow

### Create (file)

1. User selects file in FILE mode.
2. Client reads file as `ArrayBuffer` → `Uint8Array`.
3. `encryptPayload({ type: 'file', name, mimeType, data }, key)` → `EncryptedPayload`.
4. `POST /api/secrets` with the ciphertext and IV — identical to text flow.
5. Result URL: `https://host/s/<id>#<key>` — identical to text flow.

### View (file)

1. `GET /api/secrets/:id` returns ciphertext + IV.
2. `decryptPayload({ ciphertext, iv }, key)` → `WhisperPayload`.
3. If `type === 'file'` and `mimeType.startsWith('image/')`: render `<img src={objectUrl}>`.
4. Otherwise: render file icon + download button.
5. Download: `URL.createObjectURL(new Blob([data], { type: mimeType }))` + `<a download={name}>`.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| File exceeds 5 MB | Toast: `"FILE_TOO_LARGE. Maximum size is 5 MB."` — submission blocked |
| Text exceeds 700 KB | Toast: `"PAYLOAD_TOO_LARGE."` — unchanged |
| JSON parse failure on structured envelope | `"DECRYPTION_FAILED"` — same as existing wrong-key error |
| Legacy text secret decrypted via `decryptPayload` | Transparently treated as `{ type: 'text' }` — no error |
| CLI `--file` path not found | Exit 1 with `"error: file not found: <path>"` |
| CLI `--file` + stdin both provided | Exit 1 with `"error: --file and stdin input are mutually exclusive"` |

---

## Testing

### `@whisper/crypto` (Bun test runner)

- `encryptPayload` / `decryptPayload` roundtrip — text payload
- `encryptPayload` / `decryptPayload` roundtrip — file payload (binary data)
- `decryptPayload` on a legacy text secret (encrypted with `encrypt`) — returns `{ type: 'text' }`
- Large payload near 5 MB limit

### `@whisper/core` (Bun test runner)

- No new tests required — API is payload-agnostic. Existing tests unaffected.

### Web (Playwright)

- Upload a small PNG, create secret, retrieve URL, open view page, verify image renders and download works
- Upload a non-image file (e.g., `.txt`), verify download-only view

### CLI (Go `testing` package)

- `--file` with a valid temp file — verify ciphertext roundtrip and correct JSON envelope
- `--file` with a non-existent path — verify exit code 1 and error message
- `--file` + stdin both provided — verify conflict error

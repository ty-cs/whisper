import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WHISPER | FAQ',
  description:
    'How Whisper works — E2EE, zero-knowledge architecture, and security model.',
};

const faqs = [
  {
    id: '01',
    label: 'WHAT IS WHISPER?',
    content: (
      <>
        <p>
          Whisper is an anonymous, end-to-end encrypted (E2EE) secret sharing
          tool. You paste a secret, get a one-time URL, and share it. The
          recipient opens the URL and sees the plaintext. No accounts, no
          tracking, no logs.
        </p>
        <p className="mt-3 text-[var(--muted-fg)]">
          Secrets expire automatically (5 minutes to 30 days) and can optionally
          be destroyed after a single read (burn-after-reading). The server
          never sees the decryption key.
        </p>
      </>
    ),
  },
  {
    id: '02',
    label: 'HOW DOES IT WORK?',
    content: (
      <>
        <p className="mb-4">
          Encryption happens entirely in your browser before anything leaves
          your device.
        </p>
        <pre className="text-[10px] sm:text-xs leading-relaxed text-[var(--muted-fg)] overflow-x-auto">
          {`  YOU (BROWSER)                    SERVER
  ─────────────                    ──────
  plaintext
      │
      ▼
  AES-256-GCM encrypt ──ciphertext──▶ store(id, ciphertext)
  + random key (32B)
      │
      ▼
  share URL:
  https://host/#/s/<id>/<key>
                 │        │
                 │        └── fragment: NEVER sent to server
                 └────────── path: server only sees the ID`}
        </pre>
        <p className="mt-4 mb-3">When the recipient opens the URL:</p>
        <pre className="text-[10px] sm:text-xs leading-relaxed text-[var(--muted-fg)] overflow-x-auto">
          {`  RECIPIENT (BROWSER)              SERVER
  ───────────────────              ──────
  visit URL with #fragment
      │
      ├─── GET /api/secrets/<id> ──▶ return ciphertext
      │
      ▼
  AES-256-GCM decrypt
  (key from #fragment,
   never left browser)
      │
      ▼
  plaintext shown
  (optionally burned on server)`}
        </pre>
      </>
    ),
  },
  {
    id: '03',
    label: 'IS IT SAFE?',
    content: (
      <>
        <p>
          Yes, within the threat model. Whisper uses AES-256-GCM — authenticated
          encryption with a 256-bit key — which is the same algorithm used by
          banks and governments. The key never touches the server.
        </p>
        <p className="mt-3 text-[var(--muted-fg)]">
          What you must trust: the code running in your browser. If the page
          itself is compromised (e.g. a supply-chain attack on the JS bundle),
          all bets are off. For the highest assurance, review the source and
          self-host.
        </p>
        <p className="mt-3 text-[var(--muted-fg)]">
          What you do NOT need to trust: the server operator, the network, TLS
          certificates, or Redis storage — none of these can recover your
          plaintext.
        </p>
      </>
    ),
  },
  {
    id: '04',
    label: 'WHAT DOES THE SERVER KNOW?',
    content: (
      <>
        <p>The server stores only:</p>
        <ul className="mt-3 space-y-1 text-[var(--muted-fg)] ml-4">
          <li>
            <span className="text-[var(--foreground)]">ciphertext</span> — the
            encrypted blob (unreadable without the key)
          </li>
          <li>
            <span className="text-[var(--foreground)]">iv</span> — the 12-byte
            initialization vector (public, needed for decryption)
          </li>
          <li>
            <span className="text-[var(--foreground)]">salt</span> — only
            present if password-protected; used for key derivation
          </li>
          <li>
            <span className="text-[var(--foreground)]">expiresAt</span> —
            expiration timestamp
          </li>
          <li>
            <span className="text-[var(--foreground)]">burnAfterReading</span> —
            boolean flag
          </li>
          <li>
            <span className="text-[var(--foreground)]">maxViews</span> —
            optional view limit
          </li>
        </ul>
        <p className="mt-3 text-[var(--muted-fg)]">
          No IP addresses are logged. No content is readable. The decryption key
          is never transmitted to the server.
        </p>
      </>
    ),
  },
  {
    id: '05',
    label: 'THE URL FRAGMENT',
    content: (
      <>
        <p className="mb-4">The shareable URL has a precise structure:</p>
        <pre className="text-[10px] sm:text-xs leading-relaxed text-[var(--muted-fg)] overflow-x-auto">
          {`  https://whisper.example.com/#/s/AbCdEfGh/3mK9xQvZpL...
  ───────────────────────────  ─ ─ ──────── ────────────
        domain                 │    secret      base58
     (reaches server)       fragment   ID      AES key
                            anchor   (server  (browser
                          (browser   stores    only)
                            only)   ciphertext)`}
        </pre>
        <p className="mt-4 text-[var(--muted-fg)]">
          The <span className="text-[var(--foreground)]">#fragment</span> (hash)
          portion of a URL is a browser-side concept. By HTTP specification,
          browsers never include the fragment in requests sent to a server. This
          is what makes Whisper zero-knowledge: the key physically cannot reach
          the server over normal HTTP.
        </p>
      </>
    ),
  },
  {
    id: '06',
    label: 'BURN_AFTER_READING',
    content: (
      <>
        <p>
          When burn-after-reading is enabled, the server deletes the ciphertext
          immediately after the first successful retrieval. The secret can only
          be read once.
        </p>
        <p className="mt-3 text-[var(--muted-fg)]">
          Note: &quot;first retrieval&quot; means the first HTTP GET that
          returns a 200 — not the first successful decryption. A network-level
          attacker who intercepts the ciphertext before the recipient could burn
          it. This is an inherent limitation of any server-side burn mechanism.
        </p>
        <p className="mt-3 text-[var(--muted-fg)]">
          For extra protection, combine burn-after-reading with password
          protection.
        </p>
      </>
    ),
  },
  {
    id: '07',
    label: 'PASSWORD PROTECTION',
    content: (
      <>
        <p>
          Optionally add a password when creating a secret. The password is used
          to derive an additional encryption key via PBKDF2 (SHA-256, 100,000
          iterations, random 16-byte salt). This derived key wraps the primary
          AES key before storage.
        </p>
        <p className="mt-3 text-[var(--muted-fg)]">
          The server stores the salt but not the password or derived key. The
          recipient must enter the correct password in their browser to decrypt.
          Share the password through a separate channel (e.g., a phone call) for
          maximum security.
        </p>
        <p className="mt-3 text-[var(--muted-fg)]">
          Without the password, the ciphertext in the URL fragment alone is
          insufficient to decrypt the secret.
        </p>
      </>
    ),
  },
  {
    id: '08',
    label: 'TECHNICAL_SPEC',
    content: (
      <>
        <div className="space-y-2">
          {[
            [
              'Algorithm',
              'AES-256-GCM (authenticated encryption, 256-bit key, 12-byte IV)',
            ],
            [
              'Key generation',
              'crypto.getRandomValues() via Web Crypto API (CSPRNG)',
            ],
            ['Key encoding', 'Base58 (Bitcoin alphabet) in URL fragment'],
            ['Key size', '32 bytes = 256 bits'],
            ['IV size', '12 bytes (96 bits, GCM standard)'],
            [
              'Password KDF',
              'PBKDF2-SHA-256, 100,000 iterations, 16-byte random salt',
            ],
            ['Storage backend', 'Upstash Redis via HTTP (server-side)'],
            [
              'CLI interop',
              'Go CLI uses identical AES-256-GCM + Base58 (cross-compatible)',
            ],
            [
              'Runtime',
              'Web Crypto API — browsers, Node 20+, Cloudflare Workers, Vercel Edge',
            ],
          ].map(([key, val]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:gap-4">
              <span className="text-[var(--foreground)] shrink-0 sm:w-40">
                {key}
              </span>
              <span className="text-[var(--muted-fg)]">{val}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[var(--muted-fg)] text-[10px]">
          The TypeScript crypto library (
          <code className="text-[var(--foreground)]">@whisper/crypto</code>) and
          Go implementation (
          <code className="text-[var(--foreground)]">internal/crypto</code>) are
          cross-compatible: secrets created with the CLI can be decrypted in the
          browser and vice versa.
        </p>
      </>
    ),
  },
  {
    id: '09',
    label: 'LIMITATIONS & TRUST MODEL',
    content: (
      <>
        <p className="mb-3">Things Whisper protects against:</p>
        <ul className="space-y-1 text-[var(--muted-fg)] ml-4 mb-4">
          <li>✓ Server operator reading your secrets</li>
          <li>✓ Database breaches exposing plaintext</li>
          <li>✓ Network interception of the decryption key</li>
          <li>✓ Passive surveillance of stored data</li>
        </ul>
        <p className="mb-3">Things Whisper does NOT protect against:</p>
        <ul className="space-y-1 text-[var(--muted-fg)] ml-4">
          <li>✗ A compromised browser or OS on your device</li>
          <li>✗ A malicious JavaScript bundle served from the host</li>
          <li>✗ Screen recording or shoulder surfing</li>
          <li>✗ The recipient sharing the secret after reading it</li>
          <li>✗ Timing attacks to determine when a secret was accessed</li>
        </ul>
        <p className="mt-4 text-[var(--muted-fg)]">
          For maximum trust: review the source code, verify the deployed bundle,
          and self-host. The architecture is intentionally simple — there is no
          server-side logic that could leak keys.
        </p>
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center gap-2 text-[var(--muted-fg)] text-xs tracking-widest mb-2">
        <span className="text-[var(--foreground)]">▶</span>
        <span>./faq.sh</span>
      </div>

      {faqs.map((faq) => (
        <div key={faq.id} className="term-card flex flex-col gap-3">
          <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
            <span className="text-[var(--muted-fg)] text-[10px] tracking-widest">
              [ {faq.id} ]
            </span>
            <h2 className="text-xs sm:text-sm tracking-widest uppercase font-bold">
              {faq.label}
            </h2>
          </div>
          <div className="text-xs sm:text-sm leading-relaxed text-[var(--muted-fg)] [&>p]:text-[var(--foreground)]">
            {faq.content}
          </div>
        </div>
      ))}
    </div>
  );
}

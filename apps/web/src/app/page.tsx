'use client';

import { useState } from 'react';
import { generateKey, encrypt, deriveKeyFromPassword, uint8ToBase58 } from '@whisper/crypto';

export default function Home() {
  const [text, setText] = useState('');
  const [expiresIn, setExpiresIn] = useState('24h');
  const [maxViews, setMaxViews] = useState<number>(0);
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [password, setPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Secret message cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const urlKey = generateKey();
      let encryptionKey = urlKey;

      if (password) {
        encryptionKey = await deriveKeyFromPassword(password, urlKey);
      }

      const payload = await encrypt(text, encryptionKey);

      const reqBody = {
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        salt: payload.salt, // the randomly generated one from encrypt
        expiresIn: expiresIn,
        burnAfterReading: burnAfterReading,
        maxViews: maxViews,
        hasPassword: !!password,
      };

      const res = await fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();

      // Generate the URL: /s/[id]#[key in base58]
      const keyStr = uint8ToBase58(urlKey);
      const url = `${window.location.origin}/s/${data.id}#${keyStr}`;
      setResultUrl(url);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unknown error occurred while securing your secret.');
    } finally {
      setIsLoading(false);
    }
  };

  if (resultUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-2xl mx-auto space-y-6">
        <div className="w-full space-y-6 flex flex-col items-start px-4">
          <p className="text-[var(--foreground)] font-bold text-lg uppercase tracking-widest break-all">
            [ OK ] ENCRYPTION SUCCESSFUL
          </p>
          <div className="text-[var(--muted-fg)] text-sm space-y-2">
            <p>Your message has been securely encrypted.</p>
            <p>Share the following one-time link carefully:</p>
          </div>

          <div className="w-full relative group mt-4">
            <div className="absolute inset-y-0 right-2 flex items-center">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resultUrl);
                  alert('Copied to clipboard!');
                }}
                className="term-btn text-xs py-1 px-3 border-none underline"
              >
                [ COPY ]
              </button>
            </div>
            <input
              readOnly
              value={resultUrl}
              className="term-input pr-24 text-sm sm:text-base selection:bg-[var(--foreground)] selection:text-[#050505] border-dashed"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setResultUrl('');
              setText('');
              setPassword('');
            }}
            className="text-[var(--foreground)] text-sm underline hover:bg-[var(--foreground)] hover:text-[#050505] transition-colors px-1 uppercase tracking-widest mt-4"
          >
            &gt; RUN_AGAIN (CREATE ANOTHER)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-fade-in w-full max-w-4xl mx-auto font-mono">
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-8 px-2 sm:px-6">

        <div className="border-b border-[var(--muted)] pb-4 mb-2">
          <h2 className="text-[var(--foreground)] text-lg uppercase tracking-widest block font-bold">&gt; ./initiate_whisper.sh</h2>
          <p className="text-[var(--muted-fg)] text-xs mt-2 uppercase">Please enter payload below. Use standard input format.</p>
        </div>

        <div className="space-y-3 flex-1 flex flex-col animate-fade-in-up delay-300">
          <label className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
            [ INPUT STREAM ]
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="term-input flex-1 min-h-[300px] border border-[var(--border)] p-5 resize-y leading-relaxed text-sm sm:text-base focus:bg-[var(--muted)]/10"
            placeholder="Type secret payload here..."
            disabled={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-[var(--muted)] pt-8 animate-fade-in-up delay-400">
          {/* Expiry */}
          <div className="space-y-3">
            <label className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">[ LIFESPAN ]</label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              className="term-input cursor-pointer border-dashed border-b h-12"
              disabled={isLoading}
            >
              <option value="1h">1 HOUR</option>
              <option value="24h">24 HOURS</option>
              <option value="7d">7 DAYS</option>
              <option value="30d">30 DAYS</option>
            </select>
          </div>

          {/* Max Views */}
          <div className="space-y-3">
            <label className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">[ MAX VIEWS ]</label>
            <input
              type="number"
              min="0"
              value={maxViews}
              onChange={(e) => setMaxViews(parseInt(e.target.value) || 0)}
              className="term-input border-dashed border-b h-12"
              placeholder="0 (UNLIMITED)"
              disabled={isLoading}
            />
          </div>

          {/* Burn After Reading */}
          <div
            className="col-span-1 md:col-span-2 flex items-center justify-between p-4 border border-[var(--muted)] hover:border-[var(--foreground)] cursor-pointer transition-colors bg-[var(--background)] group"
            onClick={() => setBurnAfterReading(!burnAfterReading)}
          >
            <div>
              <label className="block text-sm font-bold tracking-widest uppercase cursor-pointer text-[var(--foreground)] group-hover:text-[#050505] group-hover:bg-[var(--foreground)] inline-block px-1 select-none">
                BURN_AFTER_READING
              </label>
              <p className="text-xs text-[var(--muted-fg)] mt-1 uppercase tracking-wide">Purge immediately after first access.</p>
            </div>
            <div className={`text-xl font-bold tracking-widest ${burnAfterReading ? 'text-[var(--foreground)] animate-blink' : 'text-[var(--muted)]'}`}>
              [{burnAfterReading ? 'X' : ' '}]
            </div>
          </div>

          {/* Password */}
          <div className="col-span-1 md:col-span-2 space-y-3 pt-4 border-t border-[var(--muted)]/50">
            <label className="flex items-center gap-2 text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
              [ SECOND_FACTOR_AUTH ] <span className="text-[10px] text-[var(--muted)]">-- OPTIONAL</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="term-input border-dashed border-b h-12"
              placeholder="Blank = No Password"
              disabled={isLoading}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 border border-red-500 text-red-500 text-sm font-medium animate-fade-in uppercase tracking-widest">
            FATAL: {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="term-btn-primary w-full mt-8 py-4 disabled:opacity-50 disabled:cursor-not-allowed group animate-fade-in-up delay-500"
        >
          {isLoading ? (
            <span className="animate-blink">ENCRYPTING... (PLEASE WAIT)</span>
          ) : (
            <>
              <span className="text-[#050505] group-hover:text-[var(--foreground)]">&gt;&gt;</span> EXECUTE ENCRYPTION
            </>
          )}
        </button>

      </form>
    </div>
  );
}

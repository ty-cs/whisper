'use client';

import { useMutation } from '@tanstack/react-query';
import {
  deriveKeyFromPassword,
  encrypt,
  generateKey,
  uint8ToBase58,
} from '@whisper/crypto';
import { useState } from 'react';
import { toast } from 'sonner';

export default function Home() {
  const [text, setText] = useState('');
  const [expiresIn, setExpiresIn] = useState('24h');
  const [maxViews, setMaxViews] = useState<number>(0);
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [password, setPassword] = useState('');

  const [resultUrl, setResultUrl] = useState('');

  const createSecretMutation = useMutation({
    mutationFn: async () => {
      const urlKey = generateKey();
      let encryptionKey = urlKey;

      if (password) {
        encryptionKey = await deriveKeyFromPassword(password, urlKey);
      }

      const payload = await encrypt(text, encryptionKey);

      const reqBody = {
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        salt: payload.salt,
        expiresIn,
        burnAfterReading,
        maxViews,
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
      return { id: data.id, urlKey };
    },
    onSuccess: (data) => {
      const keyStr = uint8ToBase58(data.urlKey);
      setResultUrl(`${window.location.origin}/s/${data.id}#${keyStr}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    createSecretMutation.mutate();
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

          <div className="w-full relative group mt-4 flex items-center gap-2">
            <div className="term-input flex-1 text-sm sm:text-base selection:bg-[var(--foreground)] selection:text-[#050505] border-dashed overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-[var(--muted)] scrollbar-track-transparent py-3">
              {resultUrl}
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(resultUrl);
                toast.success('COPIED_TO_CLIPBOARD');
              }}
              className="term-btn text-sm py-2 px-2 h-[46px] flex items-center justify-center shrink-0">
              [ COPY ]
            </button>
          </div>

          <div className="pt-4 w-full">
            <button
              type="button"
              onClick={() => {
                setResultUrl('');
                setText('');
                setPassword('');
              }}
              className="term-btn w-full sm:w-auto text-sm py-3 px-6 flex items-center justify-center gap-2 group/btn">
              <span className="group-hover/btn:translate-x-1 transition-transform">
                -&gt;
              </span>{' '}
              CREATE_ANOTHER
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-fade-in w-full font-mono">
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-8">
        <div className="border-b border-[var(--muted)] pb-4 mb-8">
          <h2 className="text-[var(--foreground)] text-lg uppercase tracking-widest block font-bold">
            &gt; ./initiate_whisper.sh
          </h2>
          <p className="text-[var(--muted-fg)] text-xs mt-2 uppercase">
            Please enter payload below. Use standard input format.
          </p>
        </div>

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
            disabled={createSecretMutation.isPending}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-[var(--muted)] pt-8 animate-fade-in-up delay-400">
          {/* Expiry */}
          <div className="space-y-3">
            <label
              htmlFor="expiresIn"
              className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
              [ LIFESPAN ]
            </label>
            <div className="relative group/select">
              <select
                id="expiresIn"
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                className="term-input w-full cursor-pointer border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] px-3 h-12 !rounded-none outline-none appearance-none bg-transparent relative z-10"
                disabled={createSecretMutation.isPending}>
                <option value="5m">5 MINUTES</option>
                <option value="1h">1 HOUR</option>
                <option value="24h">24 HOURS</option>
                <option value="7d">7 DAYS</option>
                <option value="30d">30 DAYS</option>
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none z-0">
                <div className="w-3 h-3 border-b-2 border-r-2 border-[var(--muted-fg)] group-hover/select:border-[var(--foreground)] rotate-45 transition-colors origin-center translate-y-[-2px]"></div>
              </div>
            </div>
          </div>

          {/* Max Views */}
          <div className="space-y-3">
            <label
              htmlFor="maxViews"
              className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
              [ MAX VIEWS ]
            </label>
            <input
              id="maxViews"
              type="number"
              min="0"
              value={maxViews}
              onChange={(e) => setMaxViews(parseInt(e.target.value, 10) || 0)}
              className="term-input border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] px-3 h-12 !rounded-none appearance-none outline-none"
              placeholder="0 (UNLIMITED)"
              disabled={createSecretMutation.isPending}
            />
          </div>

          {/* Burn After Reading */}
          <button
            type="button"
            className="w-full text-left col-span-1 md:col-span-2 flex items-center justify-between p-4 border border-[var(--muted)] hover:border-[var(--foreground)] cursor-pointer transition-colors bg-[var(--background)] group rounded-none"
            onClick={() => setBurnAfterReading(!burnAfterReading)}>
            <div>
              <span className="block text-sm font-bold tracking-widest uppercase cursor-pointer text-[var(--foreground)] group-hover:text-[#050505] group-hover:bg-[var(--foreground)] inline-block px-1 select-none">
                BURN_AFTER_READING
              </span>
              <p className="text-xs text-[var(--muted-fg)] mt-1 uppercase tracking-wide">
                Purge immediately after first access.
              </p>
            </div>
            <div
              className={`text-xl font-bold tracking-widest ${burnAfterReading ? 'text-[var(--foreground)]' : 'text-[var(--muted)] group-hover:text-[var(--foreground)]'}`}>
              [{burnAfterReading ? 'X' : ' '}]
            </div>
          </button>

          {/* Password */}
          <div className="col-span-1 md:col-span-2 space-y-3 pt-4 border-t border-[var(--muted)]/50">
            <label
              htmlFor="password"
              className="flex items-center gap-2 text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
              [ SECOND_FACTOR_AUTH ]{' '}
              <span className="text-[10px] text-[var(--muted-fg)] opacity-70">
                -- OPTIONAL
              </span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="term-input border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] px-3 h-12 !rounded-none appearance-none outline-none"
              placeholder="Blank = No Password"
              disabled={createSecretMutation.isPending}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={createSecretMutation.isPending || !text.trim()}
          className={`w-full mt-8 py-4 px-6 border font-bold uppercase tracking-[0.2em] font-mono transition-all duration-100 ease-in-out rounded-none flex items-center justify-center gap-4 relative overflow-hidden group
            ${
              createSecretMutation.isPending
                ? 'term-btn-processing border-[var(--foreground)]'
                : 'bg-[var(--foreground)] text-[#050505] border-[var(--foreground)] hover:bg-transparent hover:text-[var(--foreground)] active:scale-[0.99]'
            }
            ${!text.trim() ? 'opacity-30 cursor-not-allowed border-[var(--border)]' : ''}
          `}>
          {createSecretMutation.isPending ? (
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 border-2 border-[#050505] border-t-transparent rounded-full animate-spin"></span>
              <span className="tracking-[0.3em] font-black">
                ENCRYPTING_CORE...
              </span>
            </div>
          ) : (
            <>
              <span className="text-inherit opacity-70 group-hover:translate-x-1 transition-transform duration-100">
                &gt;&gt;
              </span>
              <span>ENCRYPT</span>
              <span className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></span>
            </>
          )}
        </button>

        {createSecretMutation.isError && (
          <div className="p-3 border border-red-500 text-red-500 text-sm font-medium animate-fade-in uppercase tracking-widest rounded-none mt-4">
            FATAL:{' '}
            {createSecretMutation.error?.message ||
              'Failed to encrypt payload.'}
          </div>
        )}
      </form>
    </div>
  );
}

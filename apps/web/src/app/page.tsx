'use client';

import { useMutation } from '@tanstack/react-query';
import {
  deriveKeyFromPassword,
  encryptPayload,
  generateKey,
  uint8ToBase58,
  type WhisperPayload,
} from '@whisper/crypto';
import { QRCodeSVG } from 'qrcode.react';
import type React from 'react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { createSecret } from '@/lib/api';

export default function Home() {
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

  const isPending = createSecretMutation.isPending;

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

  if (resultUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-2xl mx-auto">
        <div className="w-full flex flex-col px-4 gap-8">
          <div className="space-y-2">
            <p className="text-[var(--foreground)] font-bold text-lg uppercase tracking-widest">
              [ OK ] ENCRYPTION SUCCESSFUL
            </p>
            <p className="text-[var(--muted-fg)] text-sm">
              Share the link or scan the QR code. Keep it safe.
            </p>
          </div>

          <div className="w-full border border-[var(--border)] animate-fade-in-up delay-200">
            <div className="flex flex-col sm:flex-row">
              {/* QR Code */}
              <div className="flex items-center justify-center p-6 sm:p-8 sm:border-r border-b sm:border-b-0 border-[var(--border)] bg-[var(--muted)]/20">
                <div className="p-2.5 bg-[#fafafa]">
                  <QRCodeSVG
                    value={resultUrl}
                    size={140}
                    level="M"
                    bgColor="#fafafa"
                    fgColor="#09090b"
                  />
                </div>
              </div>

              {/* URL + Actions */}
              <div className="flex-1 flex flex-col">
                <div className="flex-1 p-4 sm:p-6">
                  <p className="text-[10px] font-bold tracking-widest text-[var(--muted-fg)] uppercase mb-3">
                    [ SHARE LINK ]
                  </p>
                  <div
                    data-testid="share-url"
                    className="text-sm text-[var(--foreground)] break-all leading-relaxed selection:bg-[var(--foreground)] selection:text-[#050505] font-mono max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--muted)] scrollbar-track-transparent">
                    {resultUrl}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(resultUrl);
                      toast.success('COPIED_TO_CLIPBOARD');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold tracking-widest uppercase text-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[#050505] transition-all duration-100 border-b sm:border-b-0 sm:border-r border-[var(--border)] group/copy">
                    <span className="group-hover/copy:scale-110 transition-transform">
                      &gt;
                    </span>
                    COPY_LINK
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResultUrl('');
                      setText('');
                      setSelectedFile(null);
                      setMode('text');
                      setPassword('');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold tracking-widest uppercase text-[var(--muted-fg)] hover:bg-[var(--foreground)] hover:text-[#050505] transition-all duration-100 group/new">
                    <span className="group-hover/new:scale-110 transition-transform">
                      +
                    </span>
                    NEW_SECRET
                  </button>
                </div>
              </div>
            </div>
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

        {/* Mode toggle */}
        <div className="flex border border-[var(--muted)] animate-fade-in-up delay-200">
          <button
            type="button"
            onClick={() => {
              setMode('text');
              setSelectedFile(null);
            }}
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
            onClick={() => {
              setMode('file');
              setText('');
            }}
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
            <label
              htmlFor="file-input"
              className="block text-xs font-bold tracking-widest text-[var(--muted-fg)] uppercase">
              [ PAYLOAD ]
            </label>
            <input
              id="file-input"
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
                    {(selectedFile.size / 1024).toFixed(1)} KB ·{' '}
                    {selectedFile.type || 'application/octet-stream'}
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
              <section
                aria-label="File drop zone"
                onDrop={handleFileDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                className={`flex-1 min-h-[300px] border border-dashed flex flex-col items-center justify-center gap-4 transition-colors ${
                  isDragging
                    ? 'border-[var(--foreground)] bg-[var(--muted)]/10'
                    : 'border-[var(--border)]'
                }`}>
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
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] font-bold tracking-widest uppercase text-[var(--muted-fg)] border border-[var(--muted)] px-4 py-2 hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
                  &gt; BROWSE_FILES
                </button>
              </section>
            )}
          </div>
        )}

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
                disabled={isPending}>
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
              max="10000"
              value={maxViews}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 0;
                setMaxViews(Math.min(val, 10000));
              }}
              className="term-input border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] px-3 h-12 !rounded-none appearance-none outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              placeholder="0 (UNLIMITED)"
              disabled={isPending || burnAfterReading}
            />
            <p className="text-[10px] text-[var(--muted-fg)] uppercase tracking-wide opacity-70">
              {maxViews === 0
                ? 'Set to 0 for unlimited views until expiry.'
                : `Secret will be deleted after ${maxViews} ${maxViews === 1 ? 'view' : 'views'}.`}
            </p>
          </div>

          {/* Burn After Reading */}
          <button
            type="button"
            className="w-full text-left col-span-1 md:col-span-2 flex items-center justify-between p-4 border border-[var(--muted)] hover:border-[var(--foreground)] cursor-pointer transition-colors bg-[var(--background)] group rounded-none"
            onClick={() => {
              const next = !burnAfterReading;
              setBurnAfterReading(next);
              setMaxViews(next ? 1 : 0);
            }}>
            <div>
              <span className="block text-sm font-bold tracking-widest uppercase cursor-pointer text-[var(--foreground)] group-hover:text-[#050505] group-hover:bg-[var(--foreground)] inline-block select-none">
                BURN_AFTER_READING
              </span>
              <p className="text-xs text-[var(--muted-fg)] mt-1 uppercase tracking-wide">
                Purge immediately after first access.
              </p>
            </div>
            <div
              className={`whitespace-nowrap shrink-0 text-xs font-bold tracking-widest border px-2 py-1 transition-colors ${
                burnAfterReading
                  ? 'bg-[var(--foreground)] text-[#050505] border-[var(--foreground)]'
                  : 'text-[var(--muted-fg)] border-[var(--muted)] group-hover:border-[var(--foreground)] group-hover:text-[var(--foreground)]'
              }`}>
              {burnAfterReading ? 'ENABLED' : 'DISABLED'}
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
              autoComplete={'off'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="term-input border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] px-3 h-12 !rounded-none appearance-none outline-none"
              placeholder="Blank = No Password"
              disabled={isPending}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={
            isPending || (mode === 'text' ? !text.trim() : !selectedFile)
          }
          className={`w-full mt-8 py-4 px-6 border font-bold uppercase tracking-[0.2em] font-mono transition-all duration-100 ease-in-out rounded-none flex items-center justify-center gap-4 relative overflow-hidden group
            ${
              isPending
                ? 'bg-(--foreground) text-[#050505] border-(--foreground) opacity-75 cursor-wait'
                : 'bg-(--foreground) text-[#050505] border-(--foreground) hover:bg-transparent hover:text-(--foreground) active:scale-[0.99]'
            }
            ${!isPending && (mode === 'text' ? !text.trim() : !selectedFile) ? 'opacity-30 cursor-not-allowed border-(--border)' : ''}
          `}>
          {isPending ? (
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 border-2 border-[#050505] border-t-transparent rounded-full animate-spin"></span>
              <span className="tracking-[0.3em] font-black">ENCRYPTING...</span>
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

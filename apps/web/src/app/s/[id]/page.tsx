'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { GetSecretResponse } from '@whisper/core';
import { base58ToUint8, decrypt, deriveKeyFromPassword } from '@whisper/crypto';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { deleteSecret, getSecret } from '@/lib/api';
import { EXPIRED_SENTINEL, formatTimeLeft } from '@/lib/format-time-left';

export default function ViewSecretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  const [decryptedText, setDecryptedText] = useState('');
  const [password, setPassword] = useState('');
  const [decryptionError, setDecryptionError] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  // 1. Fetch the encrypted payload
  const {
    data: payload,
    status,
    error: fetchError,
  } = useQuery({
    queryKey: ['secret', id],
    queryFn: () => getSecret(id),
    retry: false, // Don't retry 404s for destroyed secrets
  });

  // 2. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteSecret(id),
    onSuccess: () => {
      toast.success('SECRET_DESTROYED');
      router.push('/');
    },
    onError: () => {
      toast.error('FAILED_TO_DESTROY');
      router.push('/');
    },
  });

  // 3. Decrypt Mutation
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

      return await decrypt(
        {
          ciphertext: payloadData.ciphertext,
          iv: payloadData.iv,
        },
        finalKey,
      );
    },
    onSuccess: (plaintext) => {
      setDecryptedText(plaintext);
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

  // Auto-decrypt if no password is required
  useEffect(() => {
    if (
      payload &&
      !payload.hasPassword &&
      !decryptedText &&
      !decryptMutation.isPending &&
      !decryptMutation.isError
    ) {
      decryptMutation.mutate({ payloadData: payload, pass: '' });
    }
  }, [payload, decryptedText, decryptMutation]);

  useEffect(() => {
    if (!payload?.expiresAt) return;
    const expiresAt = payload.expiresAt;
    setTimeLeft(formatTimeLeft(expiresAt));
    const interval = setInterval(() => {
      const newTimeLeft = formatTimeLeft(expiresAt);
      setTimeLeft(newTimeLeft);
      if (newTimeLeft === EXPIRED_SENTINEL) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [payload?.expiresAt]);

  if (status === 'pending') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in font-mono">
        <div className="flex flex-col items-center gap-6 px-4">
          <span className="w-8 h-8 border-2 border-[var(--foreground)] border-t-[var(--background)] rounded-full animate-spin"></span>
          <h2 className="text-sm font-bold tracking-widest uppercase text-[var(--foreground)] flex items-center gap-2">
            <span className="animate-blink">&gt;</span> DECRYPTING_VAULT...
          </h2>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-xl mx-auto font-mono">
        <div className="w-full text-center space-y-6 flex flex-col items-center px-4">
          <div className="w-16 h-16 flex items-center justify-center mb-2">
            <span className="text-red-500 font-bold text-4xl">!</span>
          </div>
          <h2 className="text-xl font-bold tracking-widest uppercase text-red-500">
            FATAL: ACCESS DENIED
          </h2>
          <p className="text-[var(--muted-fg)] text-sm max-w-sm uppercase">
            {fetchError?.message || 'Secret not found or destroyed.'}
          </p>
          <Link href="/" className="term-btn w-full mt-4">
            &gt; RETURN_TO_BASE
          </Link>
        </div>
      </div>
    );
  }

  // status === 'success': payload is guaranteed defined

  if (decryptedText) {
    const isDestroyed =
      payload.burnAfterReading ||
      (payload.maxViews > 0 && payload.viewCount >= payload.maxViews) ||
      timeLeft === EXPIRED_SENTINEL;

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

          <textarea
            readOnly
            value={decryptedText}
            className="w-full bg-transparent border border-[var(--border)] outline-none p-6 flex-1 min-h-[350px] resize-none leading-relaxed text-[var(--foreground)] text-sm sm:text-base animate-fade-in-up delay-400"
          />

          <div className="flex flex-col sm:flex-row justify-end gap-4 pt-4 border-t border-[var(--muted)] animate-fade-in-up delay-500">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(decryptedText);
                toast.success('COPIED_TO_CLIPBOARD');
              }}
              className="term-btn w-full sm:w-auto text-sm py-3 px-6 flex items-center justify-center gap-2 group/btn">
              <span className="group-hover/btn:translate-x-1 transition-transform">
                -&gt;
              </span>{' '}
              COPY_CONTENTS
            </button>

            {isDestroyed ? (
              <Link
                href="/"
                className="term-btn w-full sm:w-auto text-sm py-3 px-6 text-center flex items-center justify-center gap-2 group/btn">
                <span className="group-hover/btn:translate-x-1 transition-transform">
                  -&gt;
                </span>{' '}
                RETURN_TO_BASE
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="term-btn w-full sm:w-auto text-sm py-3 px-6 text-center !text-red-500 !border-red-500 hover:!bg-red-500 hover:!text-[#050505] flex items-center justify-center gap-2 group/btn disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="group-hover/btn:translate-x-1 transition-transform">
                  -&gt;
                </span>{' '}
                {deleteMutation.isPending
                  ? 'DESTROYING...'
                  : 'DESTROY_AND_LEAVE'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (payload.hasPassword) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-md mx-auto font-mono">
        <div className="w-full space-y-8 flex flex-col items-center text-center px-4">
          <div className="w-16 h-16 flex items-center justify-center mb-2 border border-[var(--border)] rounded-none">
            <span className="text-xl text-[var(--foreground)]">🔒</span>
          </div>
          <h2 className="text-xl font-bold tracking-widest uppercase text-[var(--foreground)]">
            SECURE_VAULT_FOUND
          </h2>
          <p className="text-[var(--muted-fg)] text-xs uppercase block tracking-widest">
            SECONDARY PASSPHRASE REQUIRED.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              decryptMutation.mutate({ payloadData: payload, pass: password });
            }}
            className="space-y-6 w-full mt-4">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (decryptionError) setDecryptionError('');
              }}
              className="term-input text-center text-xl tracking-widest border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] py-3 px-4 w-full appearance-none outline-none"
              placeholder="********"
              disabled={decryptMutation.isPending}
            />

            {!!decryptionError && (
              <div className="p-3 border border-red-500 text-red-500 text-sm font-medium animate-fade-in uppercase tracking-widest">
                FATAL: {decryptionError}
              </div>
            )}

            <button
              type="submit"
              className="term-btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group transition-all duration-100 ease-in-out active:scale-[0.99]"
              disabled={decryptMutation.isPending || !password}>
              {decryptMutation.isPending ? (
                <span className="animate-blink">DECRYPTING...</span>
              ) : (
                <>
                  <span className="group-hover:translate-x-1 transition-transform">
                    -&gt;
                  </span>{' '}
                  UNLOCK_VAULT
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (decryptionError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-xl mx-auto font-mono">
        <div className="w-full text-center space-y-6 flex flex-col items-center px-4">
          <div className="w-16 h-16 flex items-center justify-center mb-2">
            <span className="text-red-500 font-bold text-4xl">!</span>
          </div>
          <h2 className="text-xl font-bold tracking-widest uppercase text-red-500">
            FATAL: DECRYPTION FAILED
          </h2>
          <p className="text-[var(--muted-fg)] text-sm max-w-sm uppercase">
            {decryptionError}
          </p>
          <Link href="/" className="term-btn w-full mt-4">
            &gt; RETURN_TO_BASE
          </Link>
        </div>
      </div>
    );
  }

  // Auto-decryption in progress (no password, mutation pending)
  return (
    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in font-mono">
      <div className="flex flex-col items-center gap-6 px-4">
        <span className="w-8 h-8 border-2 border-[var(--foreground)] border-t-[var(--background)] rounded-full animate-spin"></span>
        <h2 className="text-sm font-bold tracking-widest uppercase text-[var(--foreground)] flex items-center gap-2">
          <span className="animate-blink">&gt;</span> DECRYPTING_VAULT...
        </h2>
      </div>
    </div>
  );
}

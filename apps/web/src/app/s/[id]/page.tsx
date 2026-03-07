'use client';

import { use, useState, useEffect } from 'react';
import { decrypt, deriveKeyFromPassword, base58ToUint8 } from '@whisper/crypto';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';

export default function ViewSecretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [decryptedText, setDecryptedText] = useState('');
  const [password, setPassword] = useState('');
  const [decryptionError, setDecryptionError] = useState('');

  // 1. Fetch the encrypted payload
  const {
    data: payload,
    isLoading: isFetching,
    error: fetchError,
  } = useQuery({
    queryKey: ['secret', id],
    queryFn: async () => {
      const res = await fetch(`/api/secrets/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch secret');
      }
      return res.json();
    },
    retry: false, // Don't retry 404s for destroyed secrets
  });

  // 2. Decrypt Mutation
  const decryptMutation = useMutation({
    mutationFn: async ({
      payloadData,
      pass,
    }: {
      payloadData: any;
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
          salt: payloadData.salt,
        },
        finalKey,
      );
    },
    onSuccess: (plaintext) => {
      setDecryptedText(plaintext);
      setDecryptionError('');
    },
    onError: (err: any) => {
      console.error('Decryption error:', err);
      if (
        err.name === 'OperationError' ||
        err.message.includes('password') ||
        err.message.includes('key')
      ) {
        setDecryptionError(
          'Decryption failed. Incorrect password or invalid key.',
        );
      } else {
        setDecryptionError(err.message || 'Decryption failed.');
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

  if (
    isFetching ||
    (payload && !payload.hasPassword && !decryptedText && !decryptionError)
  ) {
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

  if (fetchError || (!payload && !isFetching)) {
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

  if (payload && payload.hasPassword && !decryptedText) {
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
              onChange={(e) => setPassword(e.target.value)}
              className="term-input text-center text-xl tracking-widest border border-[var(--muted)] hover:border-[var(--foreground)] focus:border-[var(--foreground)] py-3 px-4  appearance-none outline-none"
              placeholder="********"
              autoFocus
              disabled={decryptMutation.isPending}
            />

            {decryptionError && (
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
                  <span className="text-[#050505] group-hover:text-[var(--foreground)]">
                    &gt;&gt;
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

  if (decryptedText) {
    return (
      <div className="flex-1 flex flex-col animate-fade-in w-full max-w-4xl mx-auto font-mono">
        <div className="w-full flex-1 flex flex-col relative space-y-6 px-2 sm:px-6">
          <div className="absolute top-6 right-6 sm:top-6 sm:right-6 flex items-center gap-2">
            {payload?.burnAfterReading ? (
              <span className="px-3 py-1 bg-[var(--background)] border border-red-500 text-red-500 text-[10px] font-bold tracking-widest uppercase animate-blink">
                DESTROYED
              </span>
            ) : (
              <span className="px-3 py-1 bg-[var(--foreground)] text-[#050505] border border-[var(--border)] text-[10px] font-bold tracking-widest uppercase">
                DECRYPTED
              </span>
            )}
          </div>

          <div className="border-b border-[var(--muted)] pb-4 animate-fade-in-up delay-300">
            <h2 className="text-sm font-bold tracking-widest uppercase text-[var(--foreground)] pr-32 flex items-center gap-2">
              <span className="animate-blink">&gt;</span> CLASSIFIED INTEL
            </h2>
          </div>

          <textarea
            readOnly
            value={decryptedText}
            className="term-input border border-[var(--border)] p-6 flex-1 min-h-[350px] resize-none leading-relaxed bg-[var(--background)] text-[var(--foreground)] text-sm sm:text-base animate-fade-in-up delay-400"
          />

          <div className="flex flex-col sm:flex-row justify-end gap-4 mt-8 pt-6 border-t border-[var(--muted)] animate-fade-in-up delay-500">
            <button
              onClick={() => {
                navigator.clipboard.writeText(decryptedText);
                alert('Copied to clipboard!');
              }}
              className="term-btn w-full sm:w-auto text-sm py-3 px-6">
              [ COPY_CONTENTS ]
            </button>

            <Link
              href="/"
              className="term-btn w-full sm:w-auto text-sm py-3 px-6 text-center !text-red-500 !border-red-500 hover:!bg-red-500 hover:!text-[#050505]">
              [ DESTROY_AND_LEAVE ]
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

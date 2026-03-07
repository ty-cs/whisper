'use client';

import { use, useEffect, useState } from 'react';
import { decrypt, deriveKeyFromPassword, base58ToUint8 } from '@whisper/crypto';
import Link from 'next/link';

export default function ViewSecretPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const id = resolvedParams.id;

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // Encrypted Payload State
    const [payload, setPayload] = useState<{
        ciphertext: string;
        iv: string;
        salt: string;
        hasPassword: boolean;
        burnAfterReading: boolean;
    } | null>(null);

    // Decrypted State
    const [decryptedText, setDecryptedText] = useState('');

    // Password State
    const [password, setPassword] = useState('');
    const [isDecrypting, setIsDecrypting] = useState(false);

    useEffect(() => {
        async function fetchSecret() {
            try {
                const res = await fetch(`/api/secrets/${id}`);
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to fetch secret');
                }

                const data = await res.json();
                setPayload(data);

                // If no password is required, decrypt immediately
                if (!data.hasPassword) {
                    await handleDecrypt(data, '');
                } else {
                    setIsLoading(false);
                }

            } catch (err: any) {
                setError(err.message || 'Error loading secret.');
                setIsLoading(false);
            }
        }

        fetchSecret();
    }, [id]);

    const handleDecrypt = async (dataToDecrypt: any, pass: string) => {
        setIsDecrypting(true);
        setError('');
        try {
            // 1. Get the Key from the URL Fragment (Hash)
            const hash = window.location.hash.replace('#', '');
            if (!hash) {
                throw new Error('Encryption key not found in URL. Make sure you copied the full link.');
            }

            const urlKey = base58ToUint8(hash);
            let finalKey = urlKey;

            // 2. Derive key if password is provided
            if (dataToDecrypt.hasPassword) {
                if (!pass) {
                    throw new Error('Password is required.');
                }
                finalKey = await deriveKeyFromPassword(pass, urlKey);
            }

            // 3. Decrypt
            const plaintext = await decrypt({
                ciphertext: dataToDecrypt.ciphertext,
                iv: dataToDecrypt.iv,
                salt: dataToDecrypt.salt
            }, finalKey);

            setDecryptedText(plaintext);

        } catch (err: any) {
            console.error('Decryption error:', err);
            // Give a generic message for wrong password/key to prevent side-channel timing attacks
            if (err.name === 'OperationError' || err.message.includes('password') || err.message.includes('key')) {
                setError('Decryption failed. Incorrect password or invalid key.');
            } else {
                setError(err.message || 'Decryption failed.');
            }
        } finally {
            setIsDecrypting(false);
            setIsLoading(false);
        }
    };

    if (isLoading) {
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

    if (error && !payload) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-xl mx-auto font-mono">
                <div className="w-full text-center space-y-6 flex flex-col items-center px-4">
                    <div className="w-16 h-16 flex items-center justify-center mb-2">
                        <span className="text-red-500 font-bold text-4xl">!</span>
                    </div>
                    <h2 className="text-xl font-bold tracking-widest uppercase text-red-500">FATAL: ACCESS DENIED</h2>
                    <p className="text-[var(--muted-fg)] text-sm max-w-sm uppercase">{error}</p>
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
                    <div className="w-16 h-16 flex items-center justify-center mb-2 border border-[var(--border)]">
                        <span className="text-xl text-[var(--foreground)]">🔒</span>
                    </div>
                    <h2 className="text-xl font-bold tracking-widest uppercase text-[var(--foreground)]">SECURE_VAULT_FOUND</h2>
                    <p className="text-[var(--muted-fg)] text-xs uppercase block tracking-widest">SECONDARY PASSPHRASE REQUIRED.</p>

                    <form onSubmit={(e) => { e.preventDefault(); handleDecrypt(payload, password); }} className="space-y-6 w-full mt-4">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="term-input text-center text-xl tracking-widest border-dashed"
                            placeholder="********"
                            autoFocus
                            disabled={isDecrypting}
                        />

                        {error && (
                            <div className="p-3 border border-red-500 text-red-500 text-sm font-medium animate-fade-in uppercase tracking-widest">
                                FATAL: {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="term-btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                            disabled={isDecrypting}
                        >
                            {isDecrypting ? (
                                <span className="animate-blink">DECRYPTING...</span>
                            ) : (
                                <>
                                    <span className="text-[#050505] group-hover:text-[var(--foreground)]">&gt;&gt;</span> UNLOCK_VAULT
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
                            <span className="px-3 py-1 bg-[var(--background)] border border-red-500 text-red-500 text-[10px] font-bold tracking-widest uppercase animate-blink">DESTROYED</span>
                        ) : (
                            <span className="px-3 py-1 bg-[var(--foreground)] text-[#050505] border border-[var(--border)] text-[10px] font-bold tracking-widest uppercase">DECRYPTED</span>
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
                        className="term-input border border-[var(--border)] p-6 flex-1 min-h-[350px] resize-y leading-relaxed bg-[var(--background)] text-[var(--foreground)] text-sm sm:text-base animate-fade-in-up delay-400"
                    />

                    <div className="flex flex-col sm:flex-row justify-end gap-4 mt-8 pt-6 border-t border-[var(--muted)] animate-fade-in-up delay-500">
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(decryptedText);
                                alert('Copied to clipboard!');
                            }}
                            className="term-btn w-full sm:w-auto text-sm py-3 px-6"
                        >
                            [ COPY_CONTENTS ]
                        </button>

                        <Link href="/" className="term-btn w-full sm:w-auto text-sm py-3 px-6 text-center !text-red-500 !border-red-500 hover:!bg-red-500 hover:!text-[#050505]">
                            [ DESTROY_AND_LEAVE ]
                        </Link>
                    </div>

                </div>
            </div>
        );
    }

    return null;
}

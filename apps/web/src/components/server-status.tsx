'use client';

import { useEffect, useState } from 'react';

export function ServerStatus() {
  const [status, setStatus] = useState<'ONLINE' | 'OFFLINE' | 'CHECKING'>(
    'CHECKING',
  );
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkHealth() {
      try {
        const start = performance.now();
        const res = await fetch('/api/health');
        if (!mounted) return;

        if (res.ok) {
          const end = performance.now();
          setStatus('ONLINE');
          setLatency(Math.round(end - start));
        } else {
          setStatus('OFFLINE');
          setLatency(null);
        }
      } catch (error) {
        if (!mounted) return;
        setStatus('OFFLINE');
        setLatency(null);
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="text-xs uppercase tracking-widest flex items-center gap-2">
      <span>STATUS:</span>
      {status === 'ONLINE' ? (
        <span className="text-[var(--foreground)] flex items-center gap-2">
          ONLINE ⚡️{' '}
          {latency !== null && (
            <span className="text-[var(--muted-fg)]">({latency}MS)</span>
          )}
        </span>
      ) : status === 'CHECKING' ? (
        <span className="text-[var(--muted-fg)] animate-pulse">
          CHECKING...
        </span>
      ) : (
        <span className="text-red-500">OFFLINE 🔻</span>
      )}
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { checkHealth } from '@/lib/api';

export function ServerStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const start = performance.now();
      await checkHealth();
      const end = performance.now();
      return {
        latency: Math.round(end - start),
      };
    },
    refetchInterval: 30000,
    retry: false,
  });

  const status = isPending ? 'CHECKING' : isError ? 'OFFLINE' : 'ONLINE';
  const latency = data?.latency ?? null;

  return (
    <div className="text-xs uppercase tracking-widest flex items-center gap-2">
      <span>STATUS:</span>
      {status === 'ONLINE' ? (
        <span className="text-[var(--foreground)] flex items-center gap-2">
          ONLINE
          <span className="relative flex h-2 w-2 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500/50 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
          </span>
          {latency !== null && (
            <span className="text-[var(--muted-fg)] ml-1">({latency}MS)</span>
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

/** Format seconds remaining until `expiresAt` (Unix seconds) as a human-readable countdown. */
export function formatTimeLeft(expiresAt: number): string {
  const diff = expiresAt - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'EXPIRED';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

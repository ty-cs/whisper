const SECONDS_IN_A_MINUTE = 60;
const SECONDS_IN_AN_HOUR = SECONDS_IN_A_MINUTE * 60;
const SECONDS_IN_A_DAY = SECONDS_IN_AN_HOUR * 24;

export const EXPIRED_SENTINEL = 'EXPIRED' as const;

/** Format seconds remaining until `expiresAt` (Unix seconds) as a human-readable countdown. */
export function formatTimeLeft(expiresAt: number): string {
  const diff = expiresAt - Math.floor(Date.now() / 1000);
  if (diff <= 0) return EXPIRED_SENTINEL;
  const d = Math.floor(diff / SECONDS_IN_A_DAY);
  const h = Math.floor((diff % SECONDS_IN_A_DAY) / SECONDS_IN_AN_HOUR);
  const m = Math.floor((diff % SECONDS_IN_AN_HOUR) / SECONDS_IN_A_MINUTE);
  const s = diff % SECONDS_IN_A_MINUTE;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

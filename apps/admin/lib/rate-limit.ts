/**
 * A speed limit for admin actions that move money or send bulk email, per signed-in person and action.
 *
 * It protects against a stuck button, a script run from a signed-in browser, or a stolen session draining money or
 * mailing everyone before anyone notices. Counts live in this server process's memory: on serverless hosting each
 * instance counts separately, so the real ceiling can be a little higher than the number here. That is acceptable
 * for a brake of this kind; it is not a precise quota.
 */
const hits = new Map<string, number[]>();

export interface Limit { max: number; windowMs: number }

export const LIMITS = {
  refund: { max: 10, windowMs: 10 * 60_000 },
  planChange: { max: 30, windowMs: 10 * 60_000 },
  feeSync: { max: 30, windowMs: 10 * 60_000 },
  bulkEmail: { max: 5, windowMs: 60 * 60_000 },
  testEmail: { max: 20, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;

const wait = (ms: number) => (ms >= 90_000 ? `${Math.ceil(ms / 60_000)} minutes` : `${Math.max(1, Math.ceil(ms / 1000))} seconds`);

/** Null when the action may go ahead (and is counted); otherwise the message to show. */
export function tooMany(userId: string | null | undefined, action: keyof typeof LIMITS, now = Date.now()): string | null {
  const { max, windowMs } = LIMITS[action];
  const key = `${action}:${userId || 'unknown'}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return `That's a lot in a short time. To be safe, this is paused for ${wait(windowMs - (now - recent[0]))}.`;
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map from growing without bound.
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= 60 * 60_000)) hits.delete(k);
  return null;
}

/** For tests. */
export const resetRateLimits = () => hits.clear();

/**
 * A speed limit for admin actions that move money or send bulk email, per signed-in person and action.
 *
 * It protects against a stuck button, a script run from a signed-in browser, or a stolen session draining money or
 * mailing everyone before anyone notices.
 *
 * Actions call `tooManyShared`, which counts in the shared Redis store so the limit holds across every server
 * instance. If that store is not configured or cannot be reached, it falls back to `tooMany`, which counts in this
 * process's memory: still a brake, only a looser one. A limit must never be the reason an action cannot run at all.
 */
const hits = new Map<string, number[]>();

export interface Limit { max: number; windowMs: number }

export const LIMITS = {
  refund: { max: 10, windowMs: 10 * 60_000 },
  planChange: { max: 30, windowMs: 10 * 60_000 },
  /** Each run is a paid AI model call. */
  aiCheck: { max: 60, windowMs: 10 * 60_000 },
  feeSync: { max: 30, windowMs: 10 * 60_000 },
  invoicePreview: { max: 40, windowMs: 10 * 60_000 },
  payoutRefresh: { max: 60, windowMs: 10 * 60_000 },
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

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
let storeDownUntil = 0;

/**
 * The same limit, counted across all servers. One counter per person, action and time window; it expires by itself
 * when the window ends, so nothing is left behind in the store.
 */
export async function tooManyShared(userId: string | null | undefined, action: keyof typeof LIMITS, now = Date.now()): Promise<string | null> {
  // After a failure the store is left alone for a minute, so an outage costs one slow call, not one per action.
  if (!REDIS_URL || !REDIS_TOKEN || now < storeDownUntil) return tooMany(userId, action, now);
  const { max, windowMs } = LIMITS[action];
  const window = Math.floor(now / windowMs);
  const key = `admin:limit:${action}:${userId || 'unknown'}:${window}`;
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      // NX: only the first hit of a window sets the expiry.
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, Math.ceil(windowMs / 1000) + 5, 'NX']]),
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`limit store ${res.status}`);
    const count = Number((await res.json())?.[0]?.result);
    if (!Number.isFinite(count)) throw new Error('limit store gave no count');
    if (count > max) return `That's a lot in a short time. To be safe, this is paused for ${wait((window + 1) * windowMs - now)}.`;
    return null;
  } catch (err) {
    storeDownUntil = now + 60_000;
    console.error('[rate-limit] shared store unavailable, counting on this server:', err instanceof Error ? err.message : 'unknown error');
    return tooMany(userId, action, now);
  }
}

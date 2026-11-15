import { Redis } from '@upstash/redis';

/**
 * AI reviews that were run again (the earlier result replaced) in the current allowance period.
 *
 * An application has one screening row, so a re-run replaces it and the row count alone can't tell one review from
 * ten. These counters make every completed re-run count against the plan's allowance, like a first review does.
 * One counter per workspace and period start; it expires after the period has safely passed.
 */

let client: Redis | null | undefined;
function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

const key = (employerId: string, since: Date) => `ai-screen:reruns:${employerId}:${since.toISOString().slice(0, 13)}`;
const KEEP_SECONDS = 45 * 24 * 60 * 60;

/** Re-runs so far this period. A read that fails counts as none: it must never block a first review. */
export async function aiRerunCount(employerId: string, since: Date | null): Promise<number> {
  const r = redis();
  if (!r || !since) return 0;
  try {
    return Number(await r.get<number>(key(employerId, since))) || 0;
  } catch {
    return 0;
  }
}

/**
 * Count one re-run. False when it couldn't be recorded: in production the re-run is then refused (an uncounted
 * re-run is free AI spend); locally, without Redis, it is allowed.
 */
export async function recordAiRerun(employerId: string, since: Date | null): Promise<boolean> {
  const r = redis();
  if (!r || !since) return process.env.NODE_ENV !== 'production';
  try {
    const k = key(employerId, since);
    await r.incr(k);
    await r.expire(k, KEEP_SECONDS);
    return true;
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

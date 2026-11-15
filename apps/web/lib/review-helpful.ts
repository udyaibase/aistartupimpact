import { createHmac } from 'crypto';
import { headers } from 'next/headers';
import { Redis } from '@upstash/redis';
import { clientIpFromHeaders } from '@/lib/client-ip';

/**
 * One "helpful" vote per visitor per review. The buttons need no account, so the visitor is recognised by a keyed
 * hash of their IP, remembered for 30 days. Without this, anyone could call the action in a loop and set a
 * review's count to whatever they liked.
 */

let client: Redis | null | undefined;
function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

/** True the first time this visitor votes on this review. In production, false when it can't be checked. */
export async function claimHelpfulVote(kind: 'tool' | 'startup', reviewId: string): Promise<boolean> {
  if (typeof reviewId !== 'string' || !reviewId || reviewId.length > 64) return false;
  const r = redis();
  if (!r) return process.env.NODE_ENV !== 'production';
  try {
    const ip = clientIpFromHeaders(await headers());
    const visitor = createHmac('sha256', process.env.IP_HASH_SALT || 'helpful').update(ip).digest('hex').slice(0, 24);
    const set = await r.set(`helpful:${kind}:${reviewId}:${visitor}`, '1', { nx: true, ex: REMEMBER_SECONDS });
    return set === 'OK';
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

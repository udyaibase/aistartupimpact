import crypto from 'crypto';

/**
 * Rules shared by the two event-email senders: the host's Promote (apps/web/lib/events/promote.ts)
 * and admin event campaigns (apps/admin/app/(dashboard)/events/subscribers/actions.ts).
 * Both write EventEmailCampaign / EventCampaignRecipient, so one person never gets the same event twice.
 */

/** An event can be emailed about at most once per this many days, by anyone. */
export const EVENT_CAMPAIGN_COOLDOWN_DAYS = 7;

/**
 * One-click unsubscribe tokens for event emails: HS256 JWT {subscriberId, email}, 30-day expiry,
 * signed with NEXTAUTH_SECRET. The web and admin apps must share that secret. Verified by the web
 * app's /api/events/unsubscribe. Compatible with tokens issued earlier by `jose`.
 */
const TOKEN_TTL_SECONDS = 30 * 86400;
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET is not set');
  return s;
}

export function signEventUnsubscribeToken(subscriberId: string, email: string, now = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: 'HS256' }));
  const body = b64url(JSON.stringify({ subscriberId, email, iat: now, exp: now + TOKEN_TTL_SECONDS }));
  const sig = crypto.createHmac('sha256', secret()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyEventUnsubscribeToken(token: string, now = Math.floor(Date.now() / 1000)): { subscriberId: string; email: string } | null {
  try {
    const [head, body, sig] = token.split('.');
    if (!head || !body || !sig) return null;
    if (JSON.parse(Buffer.from(head, 'base64url').toString()).alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', secret()).update(`${head}.${body}`).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof p.exp === 'number' && p.exp < now) return null;
    if (!p.subscriberId || !p.email) return null;
    return { subscriberId: String(p.subscriberId), email: String(p.email) };
  } catch {
    return null;
  }
}

export function eventUnsubscribeUrl(siteUrl: string, subscriberId: string, email: string): string {
  return `${siteUrl.replace(/\/$/, '')}/api/events/unsubscribe?token=${signEventUnsubscribeToken(subscriberId, email)}`;
}

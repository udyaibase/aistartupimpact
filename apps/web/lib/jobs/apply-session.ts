import crypto from 'crypto';

/**
 * Short-lived, signed apply session issued after the Turnstile check and resume upload.
 * Parse and submit both require it, so the bot check runs once per application.
 */
export interface ApplySession {
  uploadId: string;
  listingId: string;
  exp: number;
}

const TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.APPLY_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('APPLY_SESSION_SECRET is not configured');
  return s;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signApplySession(uploadId: string, listingId: string): string {
  const payload = b64(JSON.stringify({ uploadId, listingId, exp: Date.now() + TTL_MS } satisfies ApplySession));
  const sig = b64(crypto.createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyApplySession(token: unknown, listingId?: string): ApplySession | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = b64(crypto.createHmac('sha256', secret()).update(payload).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ApplySession;
    if (typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    if (listingId && s.listingId !== listingId) return null;
    return s;
  } catch {
    return null;
  }
}

/** Hash IPs before storing them; we only need to group abuse, not identify people. */
export function hashIp(ip: string): string {
  return crypto.createHmac('sha256', secret()).update(ip).digest('hex').slice(0, 32);
}

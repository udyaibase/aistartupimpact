import crypto from 'crypto';

/**
 * Resend signs webhooks with Svix: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`)),
 * sent as space-separated `v1,<sig>` entries. The secret is `whsec_<base64>`.
 * Fails closed: no secret configured means every request is rejected.
 */
export function resendSignatureValid(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret = process.env.RESEND_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  // Reject replays older (or newer) than 5 minutes.
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();

  return headers.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

/** Events that mean we must stop sending marketing email to the address. Soft (transient) bounces are ignored. */
export function suppressionReason(event: { type?: string; data?: { bounce?: { type?: string } } }): 'bounced' | 'complained' | null {
  if (event.type === 'email.complained') return 'complained';
  if (event.type === 'email.bounced') return event.data?.bounce?.type?.toLowerCase() === 'transient' ? null : 'bounced';
  return null;
}

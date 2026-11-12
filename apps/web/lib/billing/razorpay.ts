import crypto from 'crypto';

/** Shared Razorpay helpers for employer plans and event-host plans. Server only. */

export const GST_RATE = 0.18;

export function withGst(amountPaise: number) {
  const gst = Math.round(amountPaise * GST_RATE);
  return { amount: amountPaise, gst, total: amountPaise + gst };
}

export function razorpayKeys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export async function createRazorpayOrder(totalPaise: number, receipt: string, notes: Record<string, string>) {
  const keys = razorpayKeys();
  if (!keys) throw new Error('razorpay_not_configured');
  const Razorpay = (await import('razorpay')).default;
  const rzp = new Razorpay({ key_id: keys.keyId, key_secret: keys.keySecret });
  const order = await rzp.orders.create({ amount: totalPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes });
  return { orderId: order.id as string, keyId: keys.keyId };
}

/** Razorpay Checkout signature: HMAC-SHA256(order_id|payment_id, key_secret). */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !signature) return false;
  return safeEqual(crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex'), signature);
}

export function webhookSignatureValid(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqual(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), signature);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export type CaptureCheck = { ok: true } | { ok: false; reason: 'not_captured' | 'mismatch' | 'error' };

/**
 * A valid checkout signature proves the payment was authorised for this order, not that money was captured.
 * Before activating anything, read the payment back from Razorpay: it must belong to this order, be in INR for the
 * exact amount we charged, and be captured. An authorised-but-uncaptured payment (account set to manual capture)
 * is captured here, so activation never runs on money Razorpay would later auto-refund.
 */
export async function ensureCaptured(paymentId: string, orderId: string, expectedPaise: number): Promise<CaptureCheck> {
  try {
    let p = await razorpayApi<{ status?: string; order_id?: string; amount?: number; currency?: string }>('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
    if (p.order_id !== orderId || p.currency !== 'INR' || p.amount !== expectedPaise) return { ok: false, reason: 'mismatch' };
    if (p.status === 'authorized') {
      // A parallel capture (webhook or the other tab) makes this fail with "already captured": re-read instead.
      await razorpayApi('POST', `/v1/payments/${encodeURIComponent(paymentId)}/capture`, { amount: expectedPaise, currency: 'INR' }).catch(() => null);
      p = await razorpayApi('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
    }
    return p.status === 'captured' ? { ok: true } : { ok: false, reason: 'not_captured' };
  } catch (err) {
    console.error('[razorpay] capture check', paymentId, err instanceof Error ? err.message : err);
    return { ok: false, reason: 'error' };
  }
}

/** Full refund of a captured payment (optionally reversing Route transfers). Returns the refund id. */
export async function refundPayment(paymentId: string, amountPaise: number, notes: Record<string, string>, opts: { reverseTransfers?: boolean } = {}): Promise<string> {
  const refund = await razorpayApi<{ id: string }>('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: amountPaise, speed: 'normal', notes, ...(opts.reverseTransfers ? { reverse_all: 1 } : {}),
  });
  return refund.id;
}

export class RazorpayApiError extends Error {
  constructor(message: string, public status: number, public field?: string) { super(message); }
}

/** Call a Razorpay REST endpoint (v1 or v2 path) with the account's key. Errors carry Razorpay's own description. */
export async function razorpayApi<T = any>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const keys = razorpayKeys();
  if (!keys) throw new RazorpayApiError('Payments are not configured.', 503);
  const res = await fetch(`https://api.razorpay.com${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as any)?.error ?? {};
    throw new RazorpayApiError(e.description || `Razorpay request failed (${res.status})`, res.status, e.field);
  }
  return data as T;
}

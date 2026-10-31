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

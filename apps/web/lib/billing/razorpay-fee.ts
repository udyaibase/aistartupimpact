import { after } from 'next/server';
import { prisma } from '@udyaibase/database';
import { razorpayKeys } from './razorpay';

/**
 * Saves what Razorpay kept on a payment (its fee, and the GST inside that fee) as soon as the payment succeeds, so
 * the admin's Billing → Reconciliation has it without anyone pressing "Sync Razorpay fees".
 *
 * Runs after the response has been sent and never throws: a slow or failing lookup must not delay or undo a
 * payment. If the fee isn't known yet (Razorpay fills it once the payment is captured) or the lookup fails, nothing
 * is stored and the admin's sync picks the payment up later. Reads from Razorpay only; writes one RazorpayFee row.
 */
export function recordRazorpayFee(paymentId: string | null | undefined): void {
  if (!paymentId || !paymentId.startsWith('pay_')) return;
  const run = () => saveFee(paymentId).catch((e) => console.error('[razorpay-fee]', paymentId, e instanceof Error ? e.message : e));
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts, tests): just don't block the caller
  }
}

/** Exported for tests. Resolves true when a fee row was written. */
export async function saveFee(paymentId: string): Promise<boolean> {
  const keys = razorpayKeys();
  if (!keys) return false;
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return false;
  const p = (await res.json().catch(() => null)) as { status?: string; fee?: unknown; tax?: unknown; method?: unknown } | null;
  if (!p || (p.status !== 'captured' && p.status !== 'refunded')) return false;
  const fee = Number(p.fee), tax = Number(p.tax ?? 0);
  if (!Number.isInteger(fee) || fee < 0 || !Number.isInteger(tax) || tax < 0 || tax > fee) return false;
  await prisma.razorpayFee.createMany({
    data: [{ paymentId, feePaise: fee, taxPaise: tax, method: typeof p.method === 'string' ? p.method.slice(0, 40) : null }],
    skipDuplicates: true,
  });
  return true;
}

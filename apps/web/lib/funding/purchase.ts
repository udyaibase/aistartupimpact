import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { emailInvoice } from '@/lib/billing/invoice';
import { purchaseToken, subscribeWithConsent } from '@/lib/funding/access';
import { isPackKey, PACKS, rupees } from '@/lib/funding/packs';

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const DAY = 864e5;

export const downloadUrl = (purchaseId: string) => `/api/funding-data/download?t=${encodeURIComponent(purchaseToken(purchaseId))}`;

/**
 * Mark a funding-data order paid. Idempotent: the checkout callback and the Razorpay webhook may both arrive;
 * only the first flips PENDING → SUCCESS, starts the access window, subscribes the buyer (they ticked the
 * consent box at checkout) and sends the download link and GST invoice.
 */
export async function activateFundingPurchase(orderId: string, paymentId: string): Promise<'activated' | 'already' | 'unknown'> {
  const p = await prisma.fundingDataPurchase.findUnique({ where: { razorpayOrderId: orderId } });
  if (!p) return 'unknown';
  const now = new Date();
  const days = isPackKey(p.pack) ? PACKS[p.pack].accessDays : 7;
  const flipped = await prisma.fundingDataPurchase.updateMany({
    where: { id: p.id, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'SUCCESS', razorpayPaymentId: paymentId, paidAt: now, failedAt: null, accessExpiresAt: new Date(now.getTime() + days * DAY) },
  });
  if (!flipped.count) return 'already';

  await subscribeWithConsent(p.email, 'funding_paid', p.consentAt).catch((e) => console.error('[funding-data] subscribe', e instanceof Error ? e.message : e));
  sendPurchaseEmail(p.id, p.email, p.pack, p.totalPaise, new Date(now.getTime() + days * DAY));
  await emailInvoice('funding', p.id).catch((e) => console.error('[invoice] funding', e));
  return 'activated';
}

export async function markFundingPurchaseFailed(orderId: string) {
  await prisma.fundingDataPurchase.updateMany({ where: { razorpayOrderId: orderId, status: 'PENDING' }, data: { status: 'FAILED', failedAt: new Date() } });
}

function sendPurchaseEmail(id: string, to: string, pack: string, totalPaise: number, until: Date) {
  const def = isPackKey(pack) ? PACKS[pack] : null;
  const untilText = until.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const reuse = pack === 'FULL'
    ? `Use this link any time until <strong>${esc(untilText)}</strong>. Every download has the latest data (up to ${def?.downloads ?? 100} downloads).`
    : `The link works until <strong>${esc(untilText)}</strong> for up to ${def?.downloads ?? 5} downloads, each with the latest data for your selection.`;
  sendEmailFireAndForget({
    to,
    subject: `Your funding data is ready: ${def?.name ?? 'Udyaibase'} (${rupees(totalPaise)})`,
    type: 'funding_data_purchase',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Thanks for your purchase</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Your <strong>${esc(def?.name ?? pack)}</strong> funding dataset (Excel) is ready. ${reuse}</p>
<p style="margin:0 0 24px">${button(`${SITE()}${downloadUrl(id)}`, 'Download the Excel file')}</p>
<p style="margin:0 0 8px;font-size:13px;color:#6b7280">Your GST invoice is sent in a separate email. The file is licensed to you; please don’t share or resell it.</p>
<p style="margin:0;font-size:13px;color:#6b7280">Order ${esc(id)}. Questions? Reply to this email.</p>`),
  });
}

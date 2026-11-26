'use server';

import { prisma } from '@udyaibase/database';
import { requireActionAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { endPlanNow } from '../plans/actions';
import { refreshPublic, requestCreditNote } from '@/lib/refresh-public';
import { tooMany } from '@/lib/rate-limit';
import { sectionRoles } from '@/lib/section-access';

/**
 * Refunds for employer plans, event-host purchases (Pro, Boost, certificates) and funding-data downloads. The billing
 * pages themselves read through lib/billing. Online payments are refunded through Razorpay; manual (invoice/UPI) grants are only recorded,
 * since that money goes back by bank transfer. Super admins only.
 */

/** `unknown`: the request didn't get an answer (timeout, network), so the refund may or may not have happened. */
async function razorpayRefund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<{ ok: true; id: string } | { ok: false; error: string; unknown?: boolean }> {
  const keyId = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return { ok: false, error: 'Razorpay keys aren’t set on the admin app (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).' };
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}` },
      body: JSON.stringify({ amount: amountPaise, speed: 'normal', notes }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.id) return { ok: false, error: d?.error?.description || `Razorpay returned HTTP ${res.status}` };
    return { ok: true, id: String(d.id) };
  } catch (e) {
    return { ok: false, unknown: true, error: `No answer from Razorpay (${(e as Error).message}). The refund may still have gone through: check this payment in the Razorpay dashboard before trying again. It stays marked as refunding until then.` };
  }
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Refund one payment, fully or partly, once. Optionally end what it bought: the plan (employer, host Pro)
 * or the Boost on that event. The customer is emailed. GST: the invoice needs a credit note from accounts.
 */
export async function refundPaymentAction(input: { source: 'EMPLOYER' | 'HOST' | 'FUNDING'; id: string; amountRupees: number; reason: string; endAccess: boolean }) {
  const { session, error } = await requireActionAuth(sectionRoles('/billing'));
  if (error) return { success: false as const, error };
  const paused = tooMany(session?.user?.id, 'refund');
  if (paused) return { success: false as const, error: paused };
  const reason = input.reason.trim().slice(0, 300);
  if (reason.length < 3) return { success: false as const, error: 'Add a short reason (it’s kept in the audit log).' };

  if (input.source === 'FUNDING') return refundFundingPurchase(input, reason, session?.user?.email ?? 'admin');
  const p = input.source === 'EMPLOYER'
    ? await prisma.jobBoardPayment.findUnique({ where: { id: input.id }, include: { Employer: { select: { id: true, email: true, companyName: true } } } })
    : await prisma.organizerPayment.findUnique({ where: { id: input.id }, include: { organizer: { select: { id: true, email: true, name: true } } } });
  if (!p) return { success: false as const, error: 'Payment not found.' };
  if (p.status !== 'SUCCESS') return { success: false as const, error: 'Only successful payments can be refunded.' };
  if (p.refundedAt) return { success: false as const, error: 'This payment was already refunded.' };

  const amountPaise = Math.round(Number(input.amountRupees) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise > p.totalPaise) {
    return { success: false as const, error: `Enter an amount between ₹1 and ${rupees(p.totalPaise)}.` };
  }

  const online = !p.razorpayOrderId.startsWith('manual_');
  if (online && !p.razorpayPaymentId) return { success: false as const, error: 'No Razorpay payment id on this record, so it can’t be refunded online.' };

  // Claim the refund before asking Razorpay (PAY-04). Only one request can turn refundedAt from empty to set, so a
  // double click, or two admins at once, can't refund the same payment twice. Undone below if Razorpay says no.
  const adminEmail = session?.user?.email ?? 'admin';
  const claim = { refundedAt: new Date(), refundId: null, refundAmountPaise: amountPaise, refundReason: reason, refundedByEmail: adminEmail };
  const claimed = input.source === 'EMPLOYER'
    ? await prisma.jobBoardPayment.updateMany({ where: { id: p.id, refundedAt: null }, data: claim })
    : await prisma.organizerPayment.updateMany({ where: { id: p.id, refundedAt: null }, data: claim });
  if (claimed.count === 0) return { success: false as const, error: 'This payment was already refunded, or a refund is in progress.' };
  const release = () => input.source === 'EMPLOYER'
    ? prisma.jobBoardPayment.updateMany({ where: { id: p.id, refundId: null }, data: { refundedAt: null, refundAmountPaise: null, refundReason: null, refundedByEmail: null } })
    : prisma.organizerPayment.updateMany({ where: { id: p.id, refundId: null }, data: { refundedAt: null, refundAmountPaise: null, refundReason: null, refundedByEmail: null } });

  let refundId: string | null = null;
  if (online) {
    const r = await razorpayRefund(p.razorpayPaymentId!, amountPaise, { purpose: 'ADMIN_REFUND', paymentRecord: p.id });
    // A clear "no" from Razorpay: nothing was refunded, so the claim is let go. No answer at all: keep it.
    if (!r.ok) { if (!r.unknown) await release(); return { success: false as const, error: r.error }; }
    refundId = r.id;
    if (input.source === 'EMPLOYER') await prisma.jobBoardPayment.update({ where: { id: p.id }, data: { refundId } });
    else await prisma.organizerPayment.update({ where: { id: p.id }, data: { refundId } });
  }

  const accountId = 'Employer' in p ? p.Employer.id : p.organizer.id;
  const kind = 'kind' in p ? p.kind : 'PLAN';
  if (input.endAccess) {
    if (kind === 'BOOST' && 'eventId' in p && p.eventId) {
      await prisma.event.update({ where: { id: p.eventId }, data: { boostedAt: null, featuredUntil: new Date() } });
      await refreshPublic(['events']);
    } else if (kind === 'CERTIFICATES') {
      // Only that event's certificates switch off (already-issued ones stay valid); never the host's plan.
      if ('eventId' in p && p.eventId) await prisma.event.update({ where: { id: p.eventId }, data: { certificatesPaidAt: null } });
    } else {
      await endPlanNow(input.source, accountId);
    }
  }

  // GST credit note (numbered, emailed) is issued by the web app.
  await requestCreditNote(input.source === 'EMPLOYER' ? 'employer' : 'organizer', p.id);

  await logAuditEvent({
    action: 'UPDATE', resourceType: 'BILLING_PAYMENT', resourceId: p.id, resourceName: `${input.source} refund`,
    before: { refundedAt: null }, after: { refundAmountPaise: amountPaise, refundId, online, reason, endAccess: input.endAccess },
  });

  const to = p.paidByEmail || ('Employer' in p ? p.Employer.email : p.organizer.email);
  if (to && !to.endsWith('@udyaibase.com')) {
    sendEmailFireAndForget({
      to,
      subject: `Your refund of ${rupees(amountPaise)} from Udyaibase`,
      type: 'billing_refund',
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">We’ve refunded ${rupees(amountPaise)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${online ? 'It goes back to the card, UPI or account you paid with, usually within 5–7 working days.' : 'We’ll transfer it to the account you paid from.'}${p.invoiceNumber ? ` This relates to invoice ${p.invoiceNumber}.` : ''}</p>
${input.endAccess ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${kind === 'BOOST' ? 'The Event Boost on that event has ended.' : kind === 'CERTIFICATES' ? 'Certificates for that event have been switched off. Certificates already issued stay valid.' : 'Your paid plan has ended and your account is on the Free plan.'}</p>` : ''}
<p style="margin:0;font-size:13px;color:#6b7280">Questions? Reply to this email.</p></div>`,
    });
  }
  return { success: true as const, refundId, online };
}

/**
 * Refund a funding-data purchase. Any recorded refund stops its download link (the web app checks refundedAt);
 * the buyer keeps files already downloaded. Credit note and email as for other payments.
 */
async function refundFundingPurchase(input: { id: string; amountRupees: number }, reason: string, adminEmail: string) {
  const p = await prisma.fundingDataPurchase.findUnique({ where: { id: input.id } });
  if (!p) return { success: false as const, error: 'Payment not found.' };
  if (p.status !== 'SUCCESS') return { success: false as const, error: 'Only successful payments can be refunded.' };
  if (p.refundedAt) return { success: false as const, error: 'This payment was already refunded.' };
  const amountPaise = Math.round(Number(input.amountRupees) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise > p.totalPaise) {
    return { success: false as const, error: `Enter an amount between ₹1 and ${rupees(p.totalPaise)}.` };
  }
  if (!p.razorpayPaymentId) return { success: false as const, error: 'No Razorpay payment id on this record, so it can’t be refunded online.' };
  // Claim first so the same purchase can't be refunded twice (PAY-04); undone if Razorpay says no.
  const claimed = await prisma.fundingDataPurchase.updateMany({
    where: { id: p.id, refundedAt: null },
    data: { refundedAt: new Date(), refundId: null, refundAmountPaise: amountPaise, refundReason: reason, refundedByEmail: adminEmail },
  });
  if (claimed.count === 0) return { success: false as const, error: 'This payment was already refunded, or a refund is in progress.' };
  const r = await razorpayRefund(p.razorpayPaymentId, amountPaise, { purpose: 'ADMIN_REFUND', paymentRecord: p.id });
  if (!r.ok) {
    if (r.unknown) return { success: false as const, error: r.error };
    await prisma.fundingDataPurchase.updateMany({ where: { id: p.id, refundId: null }, data: { refundedAt: null, refundAmountPaise: null, refundReason: null, refundedByEmail: null } });
    return { success: false as const, error: r.error };
  }
  await prisma.fundingDataPurchase.update({ where: { id: p.id }, data: { refundId: r.id } });
  await requestCreditNote('funding', p.id);
  await logAuditEvent({
    action: 'UPDATE', resourceType: 'BILLING_PAYMENT', resourceId: p.id, resourceName: 'FUNDING refund',
    before: { refundedAt: null }, after: { refundAmountPaise: amountPaise, refundId: r.id, online: true, reason },
  });
  sendEmailFireAndForget({
    to: p.email,
    subject: `Your refund of ${rupees(amountPaise)} from Udyaibase`,
    type: 'billing_refund',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">We’ve refunded ${rupees(amountPaise)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">It goes back to the card, UPI or account you paid with, usually within 5–7 working days.${p.invoiceNumber ? ` This relates to invoice ${p.invoiceNumber}.` : ''}</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">The download link for this funding dataset no longer works.</p>
<p style="margin:0;font-size:13px;color:#6b7280">Questions? Reply to this email.</p></div>`,
  });
  return { success: true as const, refundId: r.id, online: true };
}

/** How many payments one "Sync Razorpay fees" run looks up. Run again for the rest. */
const FEE_SYNC_BATCH = 120;

/**
 * Reads what Razorpay kept (fee, and the GST on it) for captured payments that don't have it stored yet, and saves
 * it. Read-only at Razorpay; adds rows to RazorpayFee and changes nothing else. Safe to run as often as needed:
 * a payment is looked up once.
 */
export async function syncRazorpayFeesAction() {
  const { session, error } = await requireActionAuth(sectionRoles('/billing'));
  if (error) return { success: false as const, error };
  const paused = tooMany(session?.user?.id, 'feeSync');
  if (paused) return { success: false as const, error: paused };
  const keyId = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return { success: false as const, error: 'Razorpay keys aren’t set on the admin app (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).' };

  const { loadGatewayFees, loadLedger } = await import('@/lib/billing/ledger');
  const { ready } = await loadGatewayFees();
  if (!ready) return { success: false as const, error: 'The RazorpayFee table isn’t in the database yet. Apply the pending migration (scripts/prod-migrate.sh), then sync again.' };

  const rows = await loadLedger();
  const ids = [...new Set(rows.filter((r) => r.online && r.razorpayId && r.state !== 'FAILED' && r.gatewayFeePaise == null).map((r) => r.razorpayId!))];
  const batch = ids.slice(0, FEE_SYNC_BATCH);
  const auth = `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`;

  const found: { paymentId: string; feePaise: number; taxPaise: number; method: string | null; capturedAt: Date | null }[] = [];
  let failed = 0;
  let firstError = '';
  const lookUp = async (paymentId: string) => {
    try {
      const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(10000) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.description || `HTTP ${res.status}`);
      // Razorpay fills fee and tax once the payment is captured; until then there is nothing to store.
      if (d.status !== 'captured' && d.status !== 'refunded') return;
      const fee = Number(d.fee), tax = Number(d.tax ?? 0);
      if (!Number.isInteger(fee) || fee < 0 || !Number.isInteger(tax) || tax < 0 || tax > fee) throw new Error('Unexpected fee values');
      found.push({ paymentId, feePaise: fee, taxPaise: tax, method: typeof d.method === 'string' ? d.method.slice(0, 40) : null, capturedAt: null });
    } catch (e) {
      failed += 1;
      firstError ||= (e as Error).message;
    }
  };
  // A few at a time: quick, and well inside Razorpay's rate limits.
  for (let i = 0; i < batch.length; i += 6) await Promise.all(batch.slice(i, i + 6).map(lookUp));

  if (found.length > 0) await prisma.razorpayFee.createMany({ data: found, skipDuplicates: true });
  await logAuditEvent({
    action: 'UPDATE', resourceType: 'BILLING_PAYMENT', resourceName: 'Razorpay fee sync',
    after: { saved: found.length, failed, remaining: Math.max(0, ids.length - batch.length) },
  });
  return { success: true as const, saved: found.length, failed, remaining: Math.max(0, ids.length - batch.length) + failed, firstError };
}

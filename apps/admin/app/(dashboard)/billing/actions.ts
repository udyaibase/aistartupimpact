'use server';

import { prisma } from '@udyaibase/database';
import { requireActionAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { endPlanNow } from '../plans/actions';
import { refreshPublic, requestCreditNote } from '@/lib/refresh-public';

/**
 * Billing overview and refunds for employer plans and event-host purchases (Pro, Boost).
 * Online payments are refunded through Razorpay; manual (invoice/UPI) grants are only recorded,
 * since that money goes back by bank transfer. Super admins only.
 */

const DAY = 864e5;

export interface BillingPayment {
  id: string;
  source: 'EMPLOYER' | 'HOST';
  accountId: string;
  account: string;
  email: string;
  product: string;
  totalPaise: number;
  status: string;
  online: boolean;
  invoiceNumber: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  refundAmountPaise: number | null;
  refundReason: string | null;
  creditNoteNumber: string | null;
}

const PRODUCT: Record<string, string> = { FEATURED: 'Employer · Featured', PREMIUM: 'Employer · Premium', PRO: 'Host · Pro', BOOST: 'Host · Event Boost' };

/** Indian financial year start (1 April, IST) for a date. */
function fyStart(now: Date) {
  const ist = new Date(now.getTime() + 5.5 * 36e5);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 3, 1) - 5.5 * 36e5);
}
function monthStart(now: Date, back = 0) {
  const ist = new Date(now.getTime() + 5.5 * 36e5);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1) - 5.5 * 36e5);
}

export async function billingOverviewAction() {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false as const, error };
  const now = new Date();
  const ranges = { thisMonth: monthStart(now), lastMonth: monthStart(now, 1), fy: fyStart(now) };

  // Net revenue (paid minus refunded), excluding GST, per range and source.
  const revenue = async (from: Date, to: Date | null) => {
    const where = { status: 'SUCCESS' as const, paidAt: { gte: from, ...(to ? { lt: to } : {}) } };
    const [emp, host, tickets] = await Promise.all([
      prisma.jobBoardPayment.findMany({ where, select: { amountPaise: true, totalPaise: true, refundAmountPaise: true } }),
      prisma.organizerPayment.findMany({ where, select: { amountPaise: true, totalPaise: true, refundAmountPaise: true } }),
      prisma.eventRegistration.aggregate({ where: { paymentStatus: 'PAID', paidAt: { gte: from, ...(to ? { lt: to } : {}) } }, _sum: { platformFeePaise: true } }),
    ]);
    // A refund is of the GST-inclusive total; take the same share off the pre-GST amount.
    const net = (rows: { amountPaise: number; totalPaise: number; refundAmountPaise: number | null }[]) =>
      rows.reduce((n, r) => n + r.amountPaise - Math.round(((r.refundAmountPaise ?? 0) * r.amountPaise) / Math.max(1, r.totalPaise)), 0);
    return { employer: net(emp), host: net(host), ticketFees: tickets._sum.platformFeePaise ?? 0 };
  };

  const soon = new Date(now.getTime() + 7 * DAY);
  const [thisMonth, lastMonth, fy, activeEmployers, activeHosts, expiringEmployers, expiringHosts, failed, recent] = await Promise.all([
    revenue(ranges.thisMonth, null),
    revenue(ranges.lastMonth, ranges.thisMonth),
    revenue(ranges.fy, null),
    prisma.jobBoardEmployer.groupBy({ by: ['plan'], where: { plan: { not: 'FREE' }, planExpiresAt: { gt: now }, deletedAt: null }, _count: { _all: true } }),
    prisma.eventOrganizer.count({ where: { plan: 'PRO', planExpiresAt: { gt: now }, deletedAt: null } }),
    prisma.jobBoardEmployer.findMany({ where: { plan: { not: 'FREE' }, planExpiresAt: { gt: now, lte: soon }, deletedAt: null }, select: { id: true, companyName: true, email: true, plan: true, planExpiresAt: true }, orderBy: { planExpiresAt: 'asc' } }),
    prisma.eventOrganizer.findMany({ where: { plan: 'PRO', planExpiresAt: { gt: now, lte: soon }, deletedAt: null }, select: { id: true, name: true, company: true, email: true, planExpiresAt: true }, orderBy: { planExpiresAt: 'asc' } }),
    Promise.all([
      prisma.jobBoardPayment.count({ where: { status: 'FAILED', createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
      prisma.organizerPayment.count({ where: { status: 'FAILED', createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    ]),
    listPayments(),
  ]);

  return {
    success: true as const,
    revenue: { thisMonth, lastMonth, fy },
    active: {
      featured: activeEmployers.find((g) => g.plan === 'FEATURED')?._count._all ?? 0,
      premium: activeEmployers.find((g) => g.plan === 'PREMIUM')?._count._all ?? 0,
      hostPro: activeHosts,
    },
    expiring: [
      ...expiringEmployers.map((e) => ({ kind: 'EMPLOYER' as const, id: e.id, name: e.companyName, email: e.email, plan: e.plan, endsAt: e.planExpiresAt!.toISOString() })),
      ...expiringHosts.map((h) => ({ kind: 'HOST' as const, id: h.id, name: h.company || h.name, email: h.email, plan: 'PRO', endsAt: h.planExpiresAt!.toISOString() })),
    ].sort((a, b) => a.endsAt.localeCompare(b.endsAt)),
    failed30d: failed[0] + failed[1],
    payments: recent,
  };
}

async function listPayments(): Promise<BillingPayment[]> {
  const [emp, host] = await Promise.all([
    prisma.jobBoardPayment.findMany({
      where: { status: { in: ['SUCCESS', 'FAILED'] } }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { Employer: { select: { id: true, companyName: true, email: true } } },
    }),
    prisma.organizerPayment.findMany({
      where: { status: { in: ['SUCCESS', 'FAILED'] } }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { organizer: { select: { id: true, name: true, company: true, email: true } } },
    }),
  ]);
  const rows: BillingPayment[] = [
    ...emp.map((p) => ({
      id: p.id, source: 'EMPLOYER' as const, accountId: p.Employer.id, account: p.Employer.companyName, email: p.paidByEmail || p.Employer.email,
      product: PRODUCT[p.plan] ?? p.plan, totalPaise: p.totalPaise, status: p.status, online: !p.razorpayOrderId.startsWith('manual_'),
      invoiceNumber: p.invoiceNumber, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
      refundedAt: p.refundedAt?.toISOString() ?? null, refundAmountPaise: p.refundAmountPaise, refundReason: p.refundReason, creditNoteNumber: p.creditNoteNumber,
    })),
    ...host.map((p) => ({
      id: p.id, source: 'HOST' as const, accountId: p.organizer.id, account: p.organizer.company || p.organizer.name, email: p.paidByEmail || p.organizer.email,
      product: PRODUCT[p.kind] ?? p.kind, totalPaise: p.totalPaise, status: p.status, online: !p.razorpayOrderId.startsWith('manual_'),
      invoiceNumber: p.invoiceNumber, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
      refundedAt: p.refundedAt?.toISOString() ?? null, refundAmountPaise: p.refundAmountPaise, refundReason: p.refundReason, creditNoteNumber: p.creditNoteNumber,
    })),
  ];
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

async function razorpayRefund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
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
    return { ok: false, error: `Couldn’t reach Razorpay: ${(e as Error).message}` };
  }
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Refund one payment, fully or partly, once. Optionally end what it bought: the plan (employer, host Pro)
 * or the Boost on that event. The customer is emailed. GST: the invoice needs a credit note from accounts.
 */
export async function refundPaymentAction(input: { source: 'EMPLOYER' | 'HOST'; id: string; amountRupees: number; reason: string; endAccess: boolean }) {
  const { session, error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false as const, error };
  const reason = input.reason.trim().slice(0, 300);
  if (reason.length < 3) return { success: false as const, error: 'Add a short reason (it’s kept in the audit log).' };

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
  let refundId: string | null = null;
  if (online) {
    if (!p.razorpayPaymentId) return { success: false as const, error: 'No Razorpay payment id on this record, so it can’t be refunded online.' };
    const r = await razorpayRefund(p.razorpayPaymentId, amountPaise, { purpose: 'ADMIN_REFUND', paymentRecord: p.id });
    if (!r.ok) return { success: false as const, error: r.error };
    refundId = r.id;
  }

  const adminEmail = session?.user?.email ?? 'admin';
  const data = { refundedAt: new Date(), refundId, refundAmountPaise: amountPaise, refundReason: reason, refundedByEmail: adminEmail };
  if (input.source === 'EMPLOYER') await prisma.jobBoardPayment.update({ where: { id: p.id }, data });
  else await prisma.organizerPayment.update({ where: { id: p.id }, data });

  const accountId = 'Employer' in p ? p.Employer.id : p.organizer.id;
  const kind = 'kind' in p ? p.kind : 'PLAN';
  if (input.endAccess) {
    if (kind === 'BOOST' && 'eventId' in p && p.eventId) {
      await prisma.event.update({ where: { id: p.eventId }, data: { boostedAt: null, featuredUntil: new Date() } });
      await refreshPublic(['events']);
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
${input.endAccess ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${kind === 'BOOST' ? 'The Event Boost on that event has ended.' : 'Your paid plan has ended and your account is on the Free plan.'}</p>` : ''}
<p style="margin:0;font-size:13px;color:#6b7280">Questions? Reply to this email.</p></div>`,
    });
  }
  return { success: true as const, refundId, online };
}

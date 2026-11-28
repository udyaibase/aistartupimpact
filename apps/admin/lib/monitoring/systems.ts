import { prisma } from '@udyaibase/database';
import { callWeb, webLinkProblem } from '@/lib/web-internal';
import { REVIEW_SLOW_DAYS } from '@/lib/billing/payouts';

/**
 * Health of the money path for the Monitoring screen: database, the link to the website, payments, invoices,
 * credit notes and host payouts. `ok` true is working, false needs attention, null is information only.
 */
export interface SystemCheck {
  key: string;
  label: string;
  ok: boolean | null;
  detail: string;
  /** Where in the admin to act on it. */
  href?: string;
  action?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
const ago = (d: Date, now: Date) => {
  const h = (now.getTime() - d.getTime()) / 36e5;
  return h < 1 ? 'less than an hour ago' : h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`;
};

/** Pure: turn the counted facts into checks, so the wording and thresholds can be tested. */
export function buildSystemChecks(f: {
  dbMs: number | null; web: { reachable: boolean; invoicesOn: boolean | null; problem?: string | null };
  lastPaidAt: Date | null; failed7d: number; uninvoiced: number; uncredited: number;
  payoutsSlow: number; payoutsNeedDetails: number; payoutsBlocked: number; now: Date;
}): SystemCheck[] {
  return [
    {
      key: 'db', label: 'Database', ok: f.dbMs != null && f.dbMs < 2000,
      detail: f.dbMs == null ? 'Did not answer.' : f.dbMs < 2000 ? `Answered in ${f.dbMs} ms.` : `Slow: answered in ${f.dbMs} ms.`,
    },
    {
      key: 'web', label: 'Link to the website', ok: f.web.reachable,
      detail: f.web.reachable
        ? 'The admin can reach the website (page refresh, credit notes, invoice preview, payout re-check).'
        : `${f.web.problem ?? 'The website did not answer.'} Until this is fixed, changes made here may take hours to show on the site, and invoice preview and payout re-check will not work.`,
    },
    {
      key: 'invoices-on', label: 'GST invoices', ok: f.web.invoicesOn,
      detail: f.web.invoicesOn == null ? 'Unknown: the website did not answer.' : f.web.invoicesOn ? 'On: customers get a tax invoice after each payment.' : 'Off: seller details or the SAC code are missing, so no invoice is issued.',
      href: '/billing/invoice-settings', action: 'Invoice settings',
    },
    {
      key: 'last-payment', label: 'Last successful payment', ok: null,
      detail: f.lastPaidAt ? `${ago(f.lastPaidAt, f.now)}.` : 'No payment has been received yet.',
      href: '/billing/payments', action: 'All payments',
    },
    {
      key: 'failed', label: 'Failed payments, last 7 days', ok: f.failed7d === 0 ? true : null,
      detail: f.failed7d === 0 ? 'None.' : `${plural(f.failed7d, 'payment')} did not go through. A few are normal; a sudden jump points at the payment gateway.`,
      href: '/billing/failed', action: 'Failed payments',
    },
    {
      key: 'uninvoiced', label: 'Paid, but no invoice after a day', ok: f.uninvoiced === 0,
      detail: f.uninvoiced === 0 ? 'Every payment from the last 45 days has its invoice.' : `${plural(f.uninvoiced, 'payment')} from the last 45 days ${f.uninvoiced === 1 ? 'has' : 'have'} no invoice number. The daily invoice job should catch these; check Scheduled jobs above and Invoice settings.`,
      href: '/billing/payments', action: 'All payments',
    },
    {
      key: 'uncredited', label: 'Refunded, but no credit note after a day', ok: f.uncredited === 0,
      detail: f.uncredited === 0 ? 'Every refund of an invoiced payment has its credit note.' : `${plural(f.uncredited, 'refund')} of an invoiced payment ${f.uncredited === 1 ? 'has' : 'have'} no credit note.`,
      href: '/billing/refunds', action: 'Refunds',
    },
    {
      key: 'payouts', label: 'Host payout accounts', ok: f.payoutsSlow + f.payoutsNeedDetails + f.payoutsBlocked === 0,
      detail: f.payoutsSlow + f.payoutsNeedDetails + f.payoutsBlocked === 0
        ? 'No host is stuck.'
        : [
          f.payoutsNeedDetails ? `${plural(f.payoutsNeedDetails, 'host')} must send Razorpay more details or ${f.payoutsNeedDetails === 1 ? 'is' : 'are'} suspended` : '',
          f.payoutsSlow ? `${plural(f.payoutsSlow, 'review')} waiting ${REVIEW_SLOW_DAYS} days or more` : '',
          f.payoutsBlocked ? `${plural(f.payoutsBlocked, 'host')} with paid tickets can’t sell yet` : '',
        ].filter(Boolean).join('; ') + '.',
      href: '/billing/payouts', action: 'Host payouts',
    },
  ];
}

export async function loadSystemChecks(now = new Date()): Promise<SystemCheck[]> {
  const dayAgo = new Date(now.getTime() - 864e5);
  const since = new Date(now.getTime() - 45 * 864e5);
  const week = new Date(now.getTime() - 7 * 864e5);
  const slowBefore = new Date(now.getTime() - REVIEW_SLOW_DAYS * 864e5);

  const t0 = Date.now();
  const dbMs = await prisma.$queryRaw`SELECT 1`.then(() => Date.now() - t0).catch(() => null);

  const paid = { status: 'SUCCESS' as const, totalPaise: { gt: 0 } };
  const uninvoicedWhere = { ...paid, invoiceNumber: null, paidAt: { gte: since, lt: dayAgo } };
  const uncreditedWhere = { refundedAt: { not: null, lt: dayAgo }, refundAmountPaise: { gt: 0 }, invoiceNumber: { not: null }, creditNoteNumber: null };
  const failedWhere = { status: 'FAILED' as const, createdAt: { gte: week } };
  const last = { where: paid, orderBy: { paidAt: 'desc' as const }, select: { paidAt: true } };

  const [webRes, lastPaid, failed, uninvoiced, uncredited, payoutsSlow, payoutsNeedDetails, paidHosts] = await Promise.all([
    callWeb('/api/webhooks/invoice-settings', { action: 'status' }, 6000),
    Promise.all([prisma.jobBoardPayment.findFirst(last), prisma.organizerPayment.findFirst(last), prisma.fundingDataPurchase.findFirst(last)]),
    Promise.all([prisma.jobBoardPayment.count({ where: failedWhere }), prisma.organizerPayment.count({ where: failedWhere }), prisma.fundingDataPurchase.count({ where: failedWhere })]),
    Promise.all([prisma.jobBoardPayment.count({ where: uninvoicedWhere }), prisma.organizerPayment.count({ where: uninvoicedWhere }), prisma.fundingDataPurchase.count({ where: uninvoicedWhere })]),
    Promise.all([prisma.jobBoardPayment.count({ where: uncreditedWhere }), prisma.organizerPayment.count({ where: uncreditedWhere }), prisma.fundingDataPurchase.count({ where: uncreditedWhere })]),
    prisma.eventOrganizer.count({ where: { payoutStatus: 'UNDER_REVIEW', payoutUpdatedAt: { lt: slowBefore } } }),
    prisma.eventOrganizer.count({ where: { payoutStatus: { in: ['NEEDS_CLARIFICATION', 'SUSPENDED'] } } }),
    prisma.event.findMany({ where: { ticketTiers: { some: { priceCents: { gt: 0 } } }, organizer: { OR: [{ payoutStatus: null }, { payoutStatus: { not: 'ACTIVATED' } }] } }, select: { organizerId: true }, distinct: ['organizerId'], take: 500 }),
  ]);
  const status = webRes?.ok ? ((await webRes.json().catch(() => null)) as { enabled?: boolean } | null) : null;
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const lastPaidAt = lastPaid.map((p) => p?.paidAt ?? null).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return buildSystemChecks({
    dbMs, web: { reachable: !!webRes?.ok, invoicesOn: status?.enabled ?? null, problem: webLinkProblem(webRes) },
    lastPaidAt, failed7d: sum(failed), uninvoiced: sum(uninvoiced), uncredited: sum(uncredited),
    payoutsSlow, payoutsNeedDetails, payoutsBlocked: paidHosts.length, now,
  });
}

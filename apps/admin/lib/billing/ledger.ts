import { prisma } from '@udyaibase/database';
import { netOfRefund } from './periods';
import type { Cycle, LedgerRow, PaymentState, Stream } from './types';

/**
 * Reads every revenue stream's payments into one ledger: employer plans, event hosts (Pro, Boost, certificates),
 * funding data and founder advertising. Read-only. Ticket fees are not ledger rows (see ticketFees below).
 *
 * Each stream is capped at the newest MAX_PER_STREAM payments; totals older than that are not counted. Abandoned
 * checkouts (PENDING) are left out: they are not failures and no money moved.
 */
export const MAX_PER_STREAM = 5000;

const EMPLOYER_PLAN: Record<string, string> = { GROWTH: 'Growth', PRO: 'Pro', SCALE: 'Scale', FEATURED: 'Featured (old)', PREMIUM: 'Premium (old)', FREE: 'Free' };
const HOST_KIND: Record<string, string> = { PRO: 'Host Pro', BOOST: 'Event Boost', CERTIFICATES: 'Certificates' };
const FUNDING_PACK: Record<string, string> = { STARTER: 'Starter (50)', GROWTH: 'Growth (250)', PRO: 'Pro (500)', SCALE: 'Scale (1,000)', FULL: 'Full dataset' };
const AD_PURPOSE: Record<string, string> = { PACKAGE_PURCHASE: 'Ad package', PACKAGE_UPGRADE: 'Package upgrade', ZONE_EXTENSION: 'Zone extension', SOCIAL_POST: 'Social post' };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

interface Money {
  amountPaise: number; gstPaise: number; totalPaise: number; status: string;
  createdAt: Date; paidAt: Date | null; failedAt: Date | null; refundedAt: Date | null; refundAmountPaise: number | null;
}
function stateOf(p: Money): PaymentState {
  if (p.status !== 'SUCCESS') return 'FAILED';
  if (!p.refundedAt) return 'PAID';
  return (p.refundAmountPaise ?? 0) >= p.totalPaise ? 'REFUNDED' : 'PART_REFUNDED';
}
/** Fields every stream shares. */
function money(p: Money) {
  const state = stateOf(p);
  return {
    amountPaise: p.amountPaise, gstPaise: p.gstPaise, totalPaise: p.totalPaise, state,
    netPaise: state === 'FAILED' ? 0 : netOfRefund(p.amountPaise, p.totalPaise, p.refundAmountPaise),
    createdAt: p.createdAt.toISOString(), paidAt: iso(p.paidAt), failedAt: iso(p.failedAt) ?? (state === 'FAILED' ? p.createdAt.toISOString() : null),
    refundedAt: iso(p.refundedAt), refundAmountPaise: p.refundAmountPaise,
  };
}

const SETTLED = { status: { in: ['SUCCESS', 'FAILED'] as ('SUCCESS' | 'FAILED')[] } };

async function employerRows(): Promise<LedgerRow[]> {
  const rows = await prisma.jobBoardPayment.findMany({
    where: SETTLED, orderBy: { createdAt: 'desc' }, take: MAX_PER_STREAM,
    include: { Employer: { select: { id: true, companyName: true, email: true } } },
  });
  return rows.map((p) => ({
    id: p.id, stream: 'EMPLOYER' as const, code: p.plan, product: `Employer plan · ${EMPLOYER_PLAN[p.plan] ?? p.plan}`, cycle: p.cycle as Cycle,
    accountId: p.Employer.id, account: p.Employer.companyName, email: p.paidByEmail || p.Employer.email,
    ...money(p), online: !p.razorpayOrderId.startsWith('manual_'), foundingPrice: p.foundingPrice,
    invoiceNumber: p.invoiceNumber, razorpayId: p.razorpayPaymentId, periodStart: iso(p.periodStart), periodEnd: iso(p.periodEnd),
    refundReason: p.refundReason, refundedBy: p.refundedByEmail, creditNoteNumber: p.creditNoteNumber,
  }));
}

async function hostRows(): Promise<LedgerRow[]> {
  const rows = await prisma.organizerPayment.findMany({
    where: SETTLED, orderBy: { createdAt: 'desc' }, take: MAX_PER_STREAM,
    include: { organizer: { select: { id: true, name: true, company: true, email: true } } },
  });
  return rows.map((p) => ({
    id: p.id, stream: 'HOST' as const, code: p.kind, product: HOST_KIND[p.kind] ?? p.kind, cycle: (p.kind === 'PRO' ? p.cycle : 'ONE_TIME') as Cycle,
    accountId: p.organizer.id, account: p.organizer.company || p.organizer.name, email: p.paidByEmail || p.organizer.email,
    ...money(p), online: !p.razorpayOrderId.startsWith('manual_'), foundingPrice: p.foundingPrice,
    invoiceNumber: p.invoiceNumber, razorpayId: p.razorpayPaymentId, periodStart: iso(p.periodStart), periodEnd: iso(p.periodEnd),
    refundReason: p.refundReason, refundedBy: p.refundedByEmail, creditNoteNumber: p.creditNoteNumber,
  }));
}

async function fundingRows(): Promise<LedgerRow[]> {
  const rows = await prisma.fundingDataPurchase.findMany({ where: SETTLED, orderBy: { createdAt: 'desc' }, take: MAX_PER_STREAM });
  return rows.map((p) => {
    const bill = (p.billingDetails ?? {}) as { billingName?: string };
    return {
      id: p.id, stream: 'FUNDING' as const, code: p.pack, product: `Funding data · ${FUNDING_PACK[p.pack] ?? p.pack}`, cycle: 'ONE_TIME' as const,
      accountId: p.email.toLowerCase(), account: bill.billingName || p.email, email: p.email,
      ...money(p), online: true, foundingPrice: false,
      invoiceNumber: p.invoiceNumber, razorpayId: p.razorpayPaymentId, periodStart: null, periodEnd: iso(p.accessExpiresAt),
      refundReason: p.refundReason, refundedBy: p.refundedByEmail, creditNoteNumber: p.creditNoteNumber,
    };
  });
}

async function adRows(): Promise<LedgerRow[]> {
  const rows = await prisma.advPayment.findMany({
    where: { status: { in: ['SUCCESS', 'FAILED', 'TIMEOUT'] } }, orderBy: { createdAt: 'desc' }, take: MAX_PER_STREAM,
    include: { founder: { select: { id: true, name: true, email: true } }, package: { select: { tier: true } } },
  });
  return rows.map((p) => ({
    id: p.id, stream: 'ADS' as const, code: p.purpose,
    product: `${AD_PURPOSE[p.purpose] ?? p.purpose}${p.package?.tier ? ` · ${p.package.tier}` : ''}`, cycle: 'ONE_TIME' as const,
    accountId: p.founder.id, account: p.founder.name || p.founder.email, email: p.founder.email,
    ...money(p), online: true, foundingPrice: false,
    invoiceNumber: null, razorpayId: p.razorpayPaymentId, periodStart: null, periodEnd: null,
    refundReason: null, refundedBy: null, creditNoteNumber: null,
  }));
}

const LOADERS: Record<Stream, () => Promise<LedgerRow[]>> = { EMPLOYER: employerRows, HOST: hostRows, FUNDING: fundingRows, ADS: adRows };

/**
 * Razorpay's fee per payment id. `ready` is false while the RazorpayFee table does not exist yet (the migration has
 * not been applied): billing keeps working, just without fee figures.
 */
export async function loadGatewayFees(): Promise<{ ready: boolean; fees: Map<string, { feePaise: number; taxPaise: number }> }> {
  try {
    const rows = await prisma.razorpayFee.findMany({ select: { paymentId: true, feePaise: true, taxPaise: true } });
    return { ready: true, fees: new Map(rows.map((r) => [r.paymentId, { feePaise: r.feePaise, taxPaise: r.taxPaise }])) };
  } catch {
    return { ready: false, fees: new Map() };
  }
}

/** Payments of the given streams (all four when omitted), newest first, each with Razorpay's fee where known. */
export async function loadLedger(streams: Stream[] = ['EMPLOYER', 'HOST', 'FUNDING', 'ADS']): Promise<LedgerRow[]> {
  const [parts, { fees }] = await Promise.all([Promise.all(streams.map((s) => LOADERS[s]())), loadGatewayFees()]);
  return parts.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => {
    const fee = r.online && r.razorpayId ? fees.get(r.razorpayId) : undefined;
    return fee ? { ...r, gatewayFeePaise: fee.feePaise, gatewayTaxPaise: fee.taxPaise } : r;
  });
}

/** Udyaibase's share of paid event tickets, per IST month ("2026-11" → paise). */
export async function ticketFeesByMonth(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ month: string; fees: bigint | number }[]>`
    SELECT to_char(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month, COALESCE(SUM("platformFeePaise"), 0) AS fees
    FROM "EventRegistration"
    WHERE "paymentStatus" = 'PAID' AND "paidAt" IS NOT NULL
    GROUP BY 1`;
  return Object.fromEntries(rows.map((r) => [r.month, Number(r.fees)]));
}

export interface TicketEventRow { eventId: string; title: string; host: string; tickets: number; salesPaise: number; feesPaise: number; lastSaleAt: string | null }

/** Paid-ticket events since `since`, by Udyaibase's fee, biggest first. */
export async function ticketFeesByEvent(since: Date, take = 50): Promise<TicketEventRow[]> {
  const groups = await prisma.eventRegistration.groupBy({
    by: ['eventId'], where: { paymentStatus: 'PAID', paidAt: { gte: since } },
    _sum: { platformFeePaise: true, amountPaise: true }, _count: { _all: true }, _max: { paidAt: true },
    orderBy: { _sum: { platformFeePaise: 'desc' } }, take,
  });
  if (groups.length === 0) return [];
  const events = await prisma.event.findMany({
    where: { id: { in: groups.map((g) => g.eventId) } },
    select: { id: true, title: true, organizer: { select: { name: true, company: true } } },
  });
  const byId = new Map(events.map((e) => [e.id, e]));
  return groups.map((g) => {
    const e = byId.get(g.eventId);
    return {
      eventId: g.eventId, title: e?.title ?? 'Deleted event', host: e?.organizer.company || e?.organizer.name || '–',
      tickets: g._count._all, salesPaise: g._sum.amountPaise ?? 0, feesPaise: g._sum.platformFeePaise ?? 0, lastSaleAt: iso(g._max.paidAt),
    };
  });
}

export interface Subscriber {
  id: string; name: string; email: string; plan: string; planLabel: string; cycle: 'MONTHLY' | 'ANNUAL'; trial: boolean; endsAt: string;
}

/** Employers on a paid plan that has not run out. */
export async function employerSubscribers(now: Date): Promise<Subscriber[]> {
  const rows = await prisma.jobBoardEmployer.findMany({
    where: { plan: { not: 'FREE' }, planExpiresAt: { gt: now }, deletedAt: null },
    select: { id: true, companyName: true, email: true, plan: true, planCycle: true, planIsTrial: true, planExpiresAt: true },
    orderBy: { planExpiresAt: 'asc' },
  });
  return rows.map((e) => ({
    id: e.id, name: e.companyName, email: e.email, plan: e.plan, planLabel: EMPLOYER_PLAN[e.plan] ?? e.plan,
    cycle: e.planCycle, trial: e.planIsTrial, endsAt: e.planExpiresAt!.toISOString(),
  }));
}

/** Event hosts on Pro that has not run out. */
export async function hostSubscribers(now: Date): Promise<Subscriber[]> {
  const rows = await prisma.eventOrganizer.findMany({
    where: { plan: 'PRO', planExpiresAt: { gt: now }, deletedAt: null },
    select: { id: true, name: true, company: true, email: true, planCycle: true, planExpiresAt: true },
    orderBy: { planExpiresAt: 'asc' },
  });
  return rows.map((h) => ({
    id: h.id, name: h.company || h.name, email: h.email, plan: 'PRO', planLabel: 'Host Pro', cycle: h.planCycle, trial: false, endsAt: h.planExpiresAt!.toISOString(),
  }));
}

import { prisma } from '@udyaibase/database';
import { payoutRow, type PayoutRow, type PayoutStatus } from '@/lib/billing/payouts';

/** Every host who has started payout setup, plus hosts with paid tickets who have not. Most urgent first. */
export async function loadPayoutRows(now = new Date()): Promise<PayoutRow[]> {
  const paid = await prisma.event.groupBy({ by: ['organizerId'], where: { ticketTiers: { some: { priceCents: { gt: 0 } } } }, _count: { _all: true } });
  const paidBy = new Map(paid.map((p) => [p.organizerId, p._count._all]));
  const hosts = await prisma.eventOrganizer.findMany({
    where: { OR: [{ payoutStatus: { not: null } }, { payoutAccountId: { not: null } }, { id: { in: [...paidBy.keys()] } }] },
    select: { id: true, name: true, company: true, email: true, payoutStatus: true, payoutNote: true, payoutBankLast4: true, payoutBeneficiary: true, payoutUpdatedAt: true },
    take: 2000,
  });
  const order: Record<PayoutStatus, number> = { SUSPENDED: 0, NEEDS_CLARIFICATION: 1, UNDER_REVIEW: 2, NOT_STARTED: 3, ACTIVATED: 4 };
  return hosts.map((h) => payoutRow(h, paidBy.get(h.id) ?? 0, now))
    .sort((a, b) => order[a.status] - order[b.status] || (b.waitingDays ?? 0) - (a.waitingDays ?? 0) || a.name.localeCompare(b.name));
}

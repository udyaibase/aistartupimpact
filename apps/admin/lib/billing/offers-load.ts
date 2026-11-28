import { prisma } from '@udyaibase/database';
import { offerState, placesLeft, type OfferState } from '@udyaibase/utils/offers';

/** Offers for Billing → Offers. `ready` is false until the offers tables exist (migration 20261130090000_plan_offers). */
export interface OfferRow {
  id: string; name: string; headline: string; portal: string; plan: string; benefitDays: number; audience: string; trigger: string; code: string | null;
  benefit: string; percentOff: number | null; amountOffPaise: number | null; cycle: string;
  startsAt: string; endsAt: string; maxRedemptions: number | null; redeemedCount: number; placesLeft: number | null;
  status: string; state: OfferState; showPublicly: boolean; createdByEmail: string | null; createdAt: string;
}

export interface RedemptionRow {
  id: string; accountId: string; accountName: string; accountEmail: string; plan: string; benefitDays: number;
  startsAt: string; endsAt: string; status: string; createdAt: string;
  /** Discounts: what was taken off the price before GST. */
  discountPaise: number | null;
}

const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === 'P2021';

export async function loadOffers(now = new Date()): Promise<{ ready: boolean; offers: OfferRow[] }> {
  try {
    const rows = await prisma.planOffer.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const rank: Record<OfferState, number> = { running: 0, scheduled: 1, paused: 2, draft: 3, full: 4, finished: 5, ended: 6 };
    const offers = rows.map((o) => ({
      id: o.id, name: o.name, headline: o.headline, portal: o.portal, plan: o.plan, benefitDays: o.benefitDays, audience: o.audience, trigger: o.trigger, code: o.code,
      benefit: o.benefit, percentOff: o.percentOff, amountOffPaise: o.amountOffPaise, cycle: o.cycle,
      startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString(), maxRedemptions: o.maxRedemptions, redeemedCount: o.redeemedCount,
      placesLeft: placesLeft(o), status: o.status, state: offerState(o, now), showPublicly: o.showPublicly,
      createdByEmail: o.createdByEmail, createdAt: o.createdAt.toISOString(),
    })).sort((a, b) => rank[a.state] - rank[b.state] || b.createdAt.localeCompare(a.createdAt));
    return { ready: true, offers };
  } catch (e) {
    if (missingTable(e)) return { ready: false, offers: [] };
    throw e;
  }
}

export async function loadRedemptions(offerId: string): Promise<RedemptionRow[]> {
  // A place given back by an abandoned checkout is not a claim.
  const rows = await prisma.planOfferRedemption.findMany({ where: { offerId, status: { not: 'RELEASED' } }, orderBy: { createdAt: 'desc' }, take: 500 });
  return rows.map((r) => ({
    id: r.id, accountId: r.accountId, accountName: r.accountName, accountEmail: r.accountEmail, plan: r.plan, benefitDays: r.benefitDays,
    startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), status: r.status, createdAt: r.createdAt.toISOString(), discountPaise: r.discountPaise,
  }));
}

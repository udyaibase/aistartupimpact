import OffersClient from '@/components/billing/OffersClient';
import { card, Stat } from '@/components/billing/parts';
import { count } from '@/components/billing/format';
import { loadOffers } from '@/lib/billing/offers-load';
import { ensureCatalog } from '@/lib/catalog';
import { OFFER_PORTALS, offerPlanPricePaise, offerPlansFor } from '@udyaibase/utils/offers';

export const dynamic = 'force-dynamic';

/** Offers: a paid plan free for a while on either portal, granted automatically or claimed with a promo code. */
export default async function OffersPage() {
  const { ready, offers } = await loadOffers();
  // Monthly list prices from the catalog in force, for the form's "normally ₹…" hints (the browser's copy may be older).
  await ensureCatalog();
  const planPrices = Object.fromEntries(OFFER_PORTALS.flatMap((p) => offerPlansFor(p).map((k) => [`${p}:${k}`, offerPlanPricePaise(k, p)])));
  if (!ready) {
    return (
      <p role="status" className={`${card} p-5 text-sm text-gray-700 dark:text-gray-300`}>
        Offers need a database change that has not been applied yet (migration <span className="font-mono">20261130090000_plan_offers</span>, two new tables).
        Nothing is broken meanwhile: sign-up works as before and no offer is granted.
      </p>
    );
  }
  const running = offers.filter((o) => o.state === 'running');
  const claimed = offers.reduce((s, o) => s + o.redeemedCount, 0);
  const left = running.every((o) => o.placesLeft == null) ? null : running.reduce((s, o) => s + (o.placesLeft ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Running now" value={count(running.length)} hint={running[0] ? running.map((o) => o.name).slice(0, 2).join(', ') : 'No offer is open'} />
        <Stat label="Claimed, all offers" value={count(claimed)} hint="Companies given a free period" />
        <Stat label="Places left, running offers" value={left == null ? (running.length ? 'No limit' : '–') : count(left)} />
      </div>
      <p className={`${card} px-4 py-3 text-sm text-gray-700 dark:text-gray-300`}>
        An offer gives a paid plan free for a while, on the hiring portal or the event host portal. It is granted by itself when an account
        qualifies, or claimed with a promo code, and stops at its limit or end date. Nothing is charged and no invoice is issued; when the free
        period ends the account moves to Free unless it chooses to pay. On the hiring portal it replaces the 14-day trial.
      </p>
      <OffersClient offers={offers} planPrices={planPrices} />
    </div>
  );
}

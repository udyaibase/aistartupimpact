import { prisma } from '@udyaibase/database';
import { OFFER_CODE_RE, applyDiscount, benefitPhrase, discountSize, isDiscount, normalizeOfferCode, offerState, type OfferPortal } from '@udyaibase/utils/offers';
import { NOT_VALID, employerAccount, hostAccount, isUniqueClash, redeemOfferCode, type Account, type Offer, type RedeemResult } from '@/lib/offers/claim';

/**
 * Discount codes (Admin → Billing → Offers): a percentage or an amount off one payment for a paid plan.
 *
 * A code is used at checkout, in three steps:
 *  1. `quoteDiscount` works out the reduced price before the payment order is created;
 *  2. `holdDiscount` holds one of the offer's places against that order (a PENDING redemption), so the limit is
 *     exact even when several people are paying at once;
 *  3. `confirmDiscount` marks it used when the payment succeeds.
 * A checkout that is abandoned gives its place back after HOLD_MINUTES. If that customer then pays late anyway, the
 * discount they were shown is still honoured and counted.
 */

/** How long an unpaid checkout keeps its place. */
const HOLD_MINUTES = 45;

export interface Purchase { plan: string; cycle: string; amountPaise: number }
export type Quote = { ok: true; offer: Offer; acct: Account; code: string; label: string; discountPaise: number; finalPaise: number } | { ok: false; error: string };

/** Give back the places of checkouts that were opened and never paid. */
async function releaseStale(offerId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - HOLD_MINUTES * 60_000);
  const stale = await prisma.planOfferRedemption.findMany({ where: { offerId, status: 'PENDING', createdAt: { lt: cutoff } }, select: { id: true }, take: 200 });
  for (const s of stale) {
    await prisma.$transaction(async (tx) => {
      // Only if it is still pending: a payment may have confirmed it since we read it.
      const freed = await tx.planOfferRedemption.updateMany({ where: { id: s.id, status: 'PENDING' }, data: { status: 'RELEASED' } });
      if (freed.count) await tx.$executeRaw`UPDATE "PlanOffer" SET "redeemedCount" = GREATEST(0, "redeemedCount" - 1), "updatedAt" = NOW() WHERE id = ${offerId}`;
    });
  }
}

/** Everything that decides whether this account may use this discount code, short of the plan being bought. */
async function check(portal: OfferPortal, accountId: string, rawCode: unknown, now: Date): Promise<{ ok: true; offer: Offer; acct: Account; held: boolean } | { ok: false; error: string }> {
  const code = normalizeOfferCode(rawCode);
  if (!OFFER_CODE_RE.test(code)) return { ok: false, error: NOT_VALID };
  const found = await prisma.planOffer.findUnique({ where: { code } });
  if (!found || found.portal !== portal || found.trigger !== 'CODE' || !isDiscount(found.benefit) || found.status === 'DRAFT') return { ok: false, error: NOT_VALID };
  await releaseStale(found.id, now);
  const offer = (await prisma.planOffer.findUnique({ where: { id: found.id } })) ?? found;

  const acct = portal === 'EMPLOYER' ? await employerAccount(accountId) : await hostAccount(accountId);
  if (!acct || acct.platform) return { ok: false, error: NOT_VALID };
  const mine = await prisma.planOfferRedemption.findUnique({ where: { offerId_accountId: { offerId: offer.id, accountId: acct.id } }, select: { status: true } });
  if (mine?.status === 'ACTIVE') return { ok: false, error: 'You’ve already used this code.' };
  // A checkout this account already opened holds its place, even if the offer filled up since.
  const held = mine?.status === 'PENDING';

  const state = offerState(offer, now);
  if (state === 'scheduled') return { ok: false, error: 'This code isn’t active yet.' };
  if (state === 'full' && !held) return { ok: false, error: 'This code has been fully claimed.' };
  if (state !== 'running' && state !== 'full') return { ok: false, error: 'This code is no longer active.' };
  if (!acct.qualifies(offer, now)) {
    return { ok: false, error: offer.audience === 'VERIFIED_STARTUPS' ? 'This code is for startups verified by their founder. Verify your startup from the founder portal, then enter it again.'
      : offer.audience === 'VERIFIED_FOUNDERS' ? 'This code is for founders of a verified startup. Verify your startup from the founder portal with this email, then enter it again.'
        : 'This code isn’t for your account.' };
  }
  return { ok: true, offer, acct, held };
}

const label = (offer: Offer) => benefitPhrase({ ...offer, portal: offer.portal });

export type CodeResult = RedeemResult | { ok: true; kind: 'discount'; code: string; label: string; headline: string; plan: string; cycle: string };

/**
 * A code typed on a billing page. A free-plan code is applied at once; a discount code is checked and handed back
 * to the page, which sends it with the next checkout.
 */
export async function redeemAnyCode(portal: OfferPortal, accountId: string, rawCode: unknown, now = new Date()): Promise<CodeResult> {
  try {
    const code = normalizeOfferCode(rawCode);
    const offer = OFFER_CODE_RE.test(code) ? await prisma.planOffer.findUnique({ where: { code }, select: { benefit: true } }) : null;
    if (!offer || !isDiscount(offer.benefit)) return redeemOfferCode(portal, accountId, rawCode, now);
    const c = await check(portal, accountId, code, now);
    if (!c.ok) return c;
    return { ok: true, kind: 'discount', code: c.offer.code!, label: label(c.offer), headline: c.offer.headline, plan: c.offer.plan, cycle: c.offer.cycle };
  } catch (err) {
    console.error('[offers] code check failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Couldn’t check the code just now. Try again in a minute.' };
  }
}

/** The price after the code, for the plan and billing cycle being bought. `amountPaise` is the price before GST. */
export async function quoteDiscount(portal: OfferPortal, accountId: string, rawCode: unknown, purchase: Purchase, now = new Date()): Promise<Quote> {
  try {
    const c = await check(portal, accountId, rawCode, now);
    if (!c.ok) return c;
    const cut = applyDiscount(c.offer, purchase);
    if (!cut) {
      const cycle = c.offer.cycle === 'ANNUAL' ? 'yearly' : c.offer.cycle === 'MONTHLY' ? 'monthly' : '';
      return { ok: false, error: `This code gives ${label(c.offer)}. It doesn’t work on this ${cycle && c.offer.cycle !== purchase.cycle ? 'billing choice' : 'plan'}.` };
    }
    return { ok: true, offer: c.offer, acct: c.acct, code: c.offer.code!, label: label(c.offer), ...cut };
  } catch (err) {
    console.error('[offers] quote failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Couldn’t check the code just now. Try again in a minute.' };
  }
}

/** Hold a place for this checkout. Call after the payment order exists, with the quote it was priced from. */
export async function holdDiscount(q: Extract<Quote, { ok: true }>, purchase: Purchase, orderId: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const { offer, acct } = q;
  try {
    return await prisma.$transaction(async (tx) => {
      const mine = await tx.planOfferRedemption.findUnique({ where: { offerId_accountId: { offerId: offer.id, accountId: acct.id } }, select: { id: true, status: true } });
      if (mine?.status === 'ACTIVE') return { ok: false as const, error: 'You’ve already used this code.' };
      const data = { paymentRef: orderId, discountPaise: q.discountPaise, plan: purchase.plan, status: 'PENDING', createdAt: now, startsAt: now, endsAt: now };
      if (mine?.status === 'PENDING') {
        // The same account reopening checkout keeps the place it already holds.
        await tx.planOfferRedemption.update({ where: { id: mine.id }, data });
        return { ok: true as const };
      }
      const took = await tx.$executeRaw`
        UPDATE "PlanOffer" SET "redeemedCount" = "redeemedCount" + 1, "updatedAt" = NOW()
        WHERE id = ${offer.id} AND status = 'ACTIVE' AND "startsAt" <= ${now} AND "endsAt" > ${now}
          AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")`;
      if (!took) return { ok: false as const, error: 'This code has just been fully claimed.' };
      if (mine) await tx.planOfferRedemption.update({ where: { id: mine.id }, data }); // a place given back earlier, taken again
      else await tx.planOfferRedemption.create({ data: { ...data, offerId: offer.id, portal: acct.portal, accountId: acct.id, accountName: acct.name.slice(0, 200), accountEmail: acct.email, companyKey: acct.companyKey, benefitDays: 0 } });
      return { ok: true as const };
    });
  } catch (err) {
    if (isUniqueClash(err)) return { ok: false, error: 'Your company has already used this code.' };
    console.error('[offers] hold failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Couldn’t apply the code just now. Try again in a minute.' };
  }
}

/** The payment for this order succeeded: the code is now used. Never throws; a paid plan must not depend on it. */
export async function confirmDiscount(orderId: string): Promise<void> {
  try {
    const used = await prisma.planOfferRedemption.updateMany({ where: { paymentRef: orderId, status: 'PENDING' }, data: { status: 'ACTIVE' } });
    if (used.count) return;
    // Paid after the hold ran out: the discount was given, so it is counted, even if that passes the limit by one.
    const late = await prisma.planOfferRedemption.findFirst({ where: { paymentRef: orderId, status: 'RELEASED' }, select: { id: true, offerId: true } });
    if (!late) return;
    await prisma.$transaction([
      prisma.planOfferRedemption.update({ where: { id: late.id }, data: { status: 'ACTIVE' } }),
      prisma.$executeRaw`UPDATE "PlanOffer" SET "redeemedCount" = "redeemedCount" + 1, "updatedAt" = NOW() WHERE id = ${late.offerId}`,
    ]);
  } catch (err) {
    console.error('[offers] confirm skipped', err instanceof Error ? err.message : err);
  }
}

/** For the invoice line: " (code SAVE25: 25% off, list price Rs 4,999.00)", or '' when no code was used. */
export async function discountNote(orderId: string, amountPaise: number): Promise<string> {
  try {
    const r = await prisma.planOfferRedemption.findFirst({ where: { paymentRef: orderId }, select: { discountPaise: true, offer: { select: { code: true, benefit: true, percentOff: true, amountOffPaise: true } } } });
    if (!r?.discountPaise || !r.offer.code) return '';
    const list = ((amountPaise + r.discountPaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // The PDF font has no rupee sign, so the amount form is spelt with Rs here.
    const size = r.offer.benefit === 'PERCENT_OFF' ? discountSize(r.offer) : `Rs ${Math.round(r.discountPaise / 100).toLocaleString('en-IN')} off`;
    return ` (code ${r.offer.code}: ${size}, list price Rs ${list})`;
  } catch {
    return '';
  }
}

import { ensureCatalog } from '@/lib/catalog/server';
import { prisma } from '@udyaibase/database';
import { notifyEmployer } from '@/lib/employer/notify';
import { ownerInboxes } from '@/lib/employer/team';
import { notifyOrganizer } from '@/lib/organizer-notify';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { GRACE_DAYS, PLANS, isPaidPlan, planKeyOf } from '@/lib/employer/plans';
import { HOST_GRACE_DAYS, isPlatformOrganizer } from '@/lib/events/plans';
import { OFFER_CODE_RE, benefitLength, companyKeyOf, normalizeOfferCode, offerPlanName, offerState, type OfferAudience, type OfferPortal } from '@udyaibase/utils/offers';

/**
 * Granting offers (Admin → Billing → Offers) on the hiring portal and the event host portal.
 *
 * An offer gives a paid plan free for a number of days. It reaches an account in one of two ways:
 *  - automatically, when the account qualifies (`claimAutoOffers`, `claimHostAutoOffers`, `onStartupVerified`);
 *  - with a promo code typed on the billing page (`redeemOfferCode`).
 * At most one offer per call. The automatic paths never throw and never block sign-up or verification, and do
 * nothing before the offers tables exist.
 *
 * The limit is exact. Inside one transaction the offer's running total is raised only if the offer is still open
 * and below its limit (that update locks the row), then the grant is recorded and the plan switched on. If any step
 * fails, the total goes back. Two accounts racing for the last place cannot both get it.
 */

/** "Created just now": a hiring workspace older than this is not new, however the caller arrived here. */
const NEW_WORKSPACE_WINDOW_MS = 15 * 60_000;
const DAY = 864e5;

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type Offer = NonNullable<Awaited<ReturnType<typeof prisma.planOffer.findFirst>>>;

export interface GrantedOffer { offerId: string; headline: string; plan: string; endsAt: Date }

/** One account, in the terms an offer cares about, whichever portal it is on. */
export interface Account {
  portal: OfferPortal;
  id: string;
  name: string;
  email: string;
  companyKey: string | null;
  /** On a paid plan right now: an offer never shortens or replaces a plan someone bought. */
  paying: (now: Date) => boolean;
  /** Udyaibase's own accounts are not customers. */
  platform: boolean;
  qualifies: (offer: Pick<Offer, 'audience' | 'startsAt'>, now: Date) => boolean;
  /** When the free period would end for this offer. */
  endFor: (offer: Pick<Offer, 'plan' | 'benefitDays'>, now: Date) => Date;
  /** Switch the plan on, inside the grant's transaction. */
  apply: (tx: Tx, offer: Pick<Offer, 'plan'>, endsAt: Date, now: Date) => Promise<void>;
  announce: (o: { headline: string; plan: string; days: number; endsAt: Date }) => Promise<void>;
}

// ── Hiring portal ─────────────────────────────────────────────────────────────

export async function employerAccount(employerId: string): Promise<Account | null> {
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: employerId },
    select: { id: true, email: true, companyName: true, plan: true, planExpiresAt: true, planIsTrial: true, trialStartedAt: true, startupId: true, verifiedCompanyDomain: true, startupClaimMethod: true, createdAt: true, passwordHash: true },
  });
  if (!e) return null;
  return {
    portal: 'EMPLOYER', id: e.id, name: e.companyName, email: e.email, companyKey: companyKeyOf(e),
    platform: e.email.toLowerCase().endsWith('@udyaibase.com'),
    paying: (now) => e.plan !== 'FREE' && !e.planIsTrial && !!e.planExpiresAt && e.planExpiresAt.getTime() > now.getTime(),
    qualifies: (offer, now) =>
      offer.audience === 'NEW_WORKSPACES' ? now.getTime() - e.createdAt.getTime() <= NEW_WORKSPACE_WINDOW_MS
        : offer.audience === 'VERIFIED_STARTUPS' ? e.startupClaimMethod === 'FOUNDER' && !!e.startupId
          : offer.audience === 'ANY_ACCOUNT',
    // A running trial of the same plan that ends later than the offer would is kept as the end date.
    endFor: (offer, now) => {
      const offered = now.getTime() + offer.benefitDays * DAY;
      return planKeyOf(e.plan) === offer.plan && e.planExpiresAt && e.planExpiresAt.getTime() > offered ? e.planExpiresAt : new Date(offered);
    },
    apply: async (tx, offer, endsAt, now) => {
      if (!isPaidPlan(offer.plan)) throw new Error('offer_plan_invalid');
      const def = PLANS[offer.plan];
      await tx.jobBoardEmployer.update({
        where: { id: e.id },
        data: {
          plan: offer.plan, planCycle: 'MONTHLY', planExpiresAt: endsAt, planIsTrial: false, maxActiveJobs: def.maxActiveJobs,
          planReminderSentAt: null, planGraceNoticeAt: null,
          // The offer stands in for the 14-day trial: no second free period after it.
          ...(e.trialStartedAt ? {} : { trialStartedAt: now }),
        },
      });
      if (def.featured) {
        await tx.jobBoardListing.updateMany({ where: { employerId: e.id, status: 'OPEN', deletedAt: null }, data: { isFeatured: true, featuredUntil: new Date(endsAt.getTime() + GRACE_DAYS * DAY) } });
      }
    },
    announce: async (o) => {
      if (e.passwordHash === '') return; // an admin-made placeholder: nobody to tell yet
      const { date, site } = when(o.endsAt);
      await notifyEmployer(e.id, { type: 'offer_granted', title: `You have ${o.plan} free for ${benefitLength(o.days)}`, message: `${o.headline}. It runs until ${date}; nothing is charged.`, link: '/employer/billing' }, 'owners');
      for (const to of await ownerInboxes(e.id)) sendGrantEmail(to, 'employer_offer_granted', o, date, `${site}/employer/dashboard`);
    },
  };
}

// ── Event host portal ─────────────────────────────────────────────────────────

export async function hostAccount(organizerId: string): Promise<Account | null> {
  const o = await prisma.eventOrganizer.findUnique({
    where: { id: organizerId },
    select: { id: true, email: true, name: true, company: true, plan: true, planExpiresAt: true, emailVerified: true, createdAt: true, companyDomain: true, companyEmailVerified: true },
  });
  if (!o) return null;
  // A host is a "verified founder" when their email is a founder's who owns a startup they verified.
  const founder = await prisma.founderUser.findUnique({ where: { email: o.email.toLowerCase() }, select: { id: true } });
  const startup = founder ? await prisma.startup.findFirst({ where: { ownerId: founder.id, isVerified: true, deletedAt: null }, select: { id: true }, orderBy: { verifiedAt: 'asc' } }) : null;
  return {
    portal: 'HOST', id: o.id, name: o.company || o.name, email: o.email,
    companyKey: startup ? `startup:${startup.id}` : o.companyEmailVerified && o.companyDomain ? `domain:${o.companyDomain.toLowerCase()}` : null,
    platform: isPlatformOrganizer(o.email),
    paying: (now) => o.plan === 'PRO' && !!o.planExpiresAt && o.planExpiresAt.getTime() > now.getTime(),
    qualifies: (offer) =>
      // New means created while the offer was running, with a confirmed email (a typed address alone claims nothing).
      offer.audience === 'NEW_HOSTS' ? o.emailVerified && o.createdAt.getTime() >= offer.startsAt.getTime()
        : offer.audience === 'VERIFIED_FOUNDERS' ? !!startup
          : offer.audience === 'ANY_ACCOUNT',
    endFor: (offer, now) => new Date(now.getTime() + offer.benefitDays * DAY),
    apply: async (tx, offer, endsAt) => {
      if (offer.plan !== 'PRO') throw new Error('offer_plan_invalid');
      await tx.eventOrganizer.update({ where: { id: o.id }, data: { plan: 'PRO', planCycle: 'MONTHLY', planExpiresAt: endsAt, planReminderSentAt: null, planGraceNoticeAt: null } });
      // Pro features every upcoming event, through the plan's grace days (the same as a paid Pro).
      const upcoming = await tx.event.findMany({ where: { organizerId: o.id, status: 'PUBLISHED', deletedAt: null, endAt: { gt: new Date() } }, select: { id: true, endAt: true, featuredUntil: true } });
      for (const ev of upcoming) {
        const until = new Date(Math.min(ev.endAt.getTime(), endsAt.getTime() + HOST_GRACE_DAYS * DAY));
        if (!ev.featuredUntil || ev.featuredUntil < until) await tx.event.update({ where: { id: ev.id }, data: { featuredUntil: until } });
      }
    },
    announce: async (g) => {
      const { date, site } = when(g.endsAt);
      await notifyOrganizer(o.id, { type: 'offer_granted', title: `You have ${g.plan} free for ${benefitLength(g.days)}`, message: `${g.headline}. It runs until ${date}; nothing is charged.`, link: '/organizer/billing' });
      sendGrantEmail(o.email, 'organizer_offer_granted', g, date, `${site}/organizer`);
    },
  };
}

// ── The grant ─────────────────────────────────────────────────────────────────

/** Record one grant and switch the plan on. False when the offer has no place left (or just closed). */
async function grant(offer: Offer, acct: Account, now: Date): Promise<Date | false> {
  await ensureCatalog(); // the limits switched on are the catalog's
  const endsAt = acct.endFor(offer, now);
  return prisma.$transaction(async (tx) => {
    const took = await tx.$executeRaw`
      UPDATE "PlanOffer" SET "redeemedCount" = "redeemedCount" + 1, "updatedAt" = NOW()
      WHERE id = ${offer.id} AND status = 'ACTIVE' AND "startsAt" <= ${now} AND "endsAt" > ${now}
        AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")`;
    if (!took) return false as const;
    await tx.planOfferRedemption.create({
      data: {
        offerId: offer.id, portal: acct.portal, accountId: acct.id, accountName: acct.name.slice(0, 200), accountEmail: acct.email,
        companyKey: acct.companyKey, plan: offer.plan, benefitDays: offer.benefitDays, startsAt: now, endsAt,
      },
    });
    await acct.apply(tx, offer, endsAt, now);
    return endsAt;
  });
}

export const isUniqueClash = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';

/** Try each running automatic offer this account qualifies for, best first, and stop at the first that sticks. */
async function claimAuto(acct: Account | null, audiences: OfferAudience[], now: Date): Promise<GrantedOffer | null> {
  if (!acct || acct.platform || acct.paying(now)) return null;
  const offers = await prisma.planOffer.findMany({
    where: { portal: acct.portal, trigger: 'AUTO', benefit: 'FREE_PLAN', status: 'ACTIVE', audience: { in: audiences }, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ benefitDays: 'desc' }, { createdAt: 'asc' }],
    take: 10,
  });
  for (const offer of offers) {
    if (!acct.qualifies(offer, now)) continue;
    const endsAt = await grant(offer, acct, now).catch((err) => {
      // P2002: this account, or another account of the same company, already has this offer. Try the next one.
      if (!isUniqueClash(err)) console.error('[offers] grant failed', offer.id, err instanceof Error ? err.message : err);
      return false as const;
    });
    if (!endsAt) continue;
    await tell(acct, offer, endsAt);
    return { offerId: offer.id, headline: offer.headline, plan: offer.plan, endsAt };
  }
  return null;
}

async function tell(acct: Account, offer: Offer, endsAt: Date) {
  try {
    await acct.announce({ headline: offer.headline, plan: offerPlanName(offer.plan, offer.portal), days: offer.benefitDays, endsAt });
  } catch (err) {
    console.error('[offers] announce failed', err instanceof Error ? err.message : err);
  }
}

/** A hiring workspace has just been created or founder-verified: grant a running offer it qualifies for. */
export async function claimAutoOffers(employerId: string, audiences: OfferAudience[], now = new Date()): Promise<GrantedOffer | null> {
  try {
    return await claimAuto(await employerAccount(employerId), audiences, now);
  } catch (err) {
    // Offers are a bonus: sign-up and verification must work without them (and before the tables exist).
    console.error('[offers] claim skipped', err instanceof Error ? err.message : err);
    return null;
  }
}

/** A host account has just confirmed its email (or been created already confirmed): grant a running offer. */
export async function claimHostAutoOffers(organizerId: string, audiences: OfferAudience[] = ['NEW_HOSTS', 'VERIFIED_FOUNDERS'], now = new Date()): Promise<GrantedOffer | null> {
  try {
    return await claimAuto(await hostAccount(organizerId), audiences, now);
  } catch (err) {
    console.error('[offers] host claim skipped', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * A founder has just verified a startup they submitted or claimed. Their hiring workspace for it (if they already
 * have one) and their host account (if one uses the same email) each get a running verified-founder offer.
 * A workspace or host account made later is covered when it is created.
 */
export async function onStartupVerified(startupId: string, founderUserId: string, now = new Date()): Promise<void> {
  try {
    const [workspace, founder] = await Promise.all([
      prisma.jobBoardEmployer.findFirst({ where: { startupId, startupClaimMethod: 'FOUNDER' }, select: { id: true } }),
      prisma.founderUser.findUnique({ where: { id: founderUserId }, select: { email: true } }),
    ]);
    if (workspace) await claimAutoOffers(workspace.id, ['VERIFIED_STARTUPS'], now);
    const host = founder ? await prisma.eventOrganizer.findUnique({ where: { email: founder.email.toLowerCase() }, select: { id: true } }) : null;
    if (host) await claimHostAutoOffers(host.id, ['VERIFIED_FOUNDERS'], now);
  } catch (err) {
    console.error('[offers] startup-verified hook skipped', err instanceof Error ? err.message : err);
  }
}

// ── Promo codes ───────────────────────────────────────────────────────────────

export type RedeemResult = { ok: true; kind: 'free'; headline: string; plan: string; endsAt: Date } | { ok: false; error: string };

/** One wording for every "no such code" case, so a guess learns nothing about codes for the other portal or drafts. */
export const NOT_VALID = 'That code isn’t valid. Check it and try again.';

/** Claim a promo code typed on the billing page of the hiring portal or the event host portal. */
export async function redeemOfferCode(portal: OfferPortal, accountId: string, rawCode: unknown, now = new Date()): Promise<RedeemResult> {
  const code = normalizeOfferCode(rawCode);
  if (!OFFER_CODE_RE.test(code)) return { ok: false, error: NOT_VALID };
  try {
    const offer = await prisma.planOffer.findUnique({ where: { code } });
    if (!offer || offer.portal !== portal || offer.trigger !== 'CODE' || offer.benefit !== 'FREE_PLAN') return { ok: false, error: NOT_VALID };
    const state = offerState(offer, now);
    if (state === 'draft') return { ok: false, error: NOT_VALID };

    const acct = portal === 'EMPLOYER' ? await employerAccount(accountId) : await hostAccount(accountId);
    if (!acct || acct.platform) return { ok: false, error: NOT_VALID };
    const planName = offerPlanName(offer.plan, portal);
    // Someone re-entering their own code should hear that first, whatever has happened to the offer since.
    if (await prisma.planOfferRedemption.findUnique({ where: { offerId_accountId: { offerId: offer.id, accountId: acct.id } }, select: { id: true } })) return { ok: false, error: 'You’ve already used this code.' };
    if (state === 'scheduled') return { ok: false, error: 'This code isn’t active yet.' };
    if (state === 'full') return { ok: false, error: 'This code has been fully claimed.' };
    if (state !== 'running') return { ok: false, error: 'This code is no longer active.' };
    if (acct.paying(now)) return { ok: false, error: 'This code gives a free period to accounts that aren’t on a paid plan. You already have one, so there’s nothing to add.' };
    if (!acct.qualifies(offer, now)) {
      return { ok: false, error: offer.audience === 'VERIFIED_STARTUPS' ? 'This code is for startups verified by their founder. Verify your startup from the founder portal, then enter it again.'
        : offer.audience === 'VERIFIED_FOUNDERS' ? 'This code is for founders of a verified startup. Verify your startup from the founder portal with this email, then enter it again.'
          : 'This code isn’t for your account.' };
    }

    const endsAt = await grant(offer, acct, now).catch((err) => {
      if (isUniqueClash(err)) return 'used' as const;
      throw err;
    });
    if (endsAt === 'used') return { ok: false, error: 'Your company has already used this code.' };
    if (!endsAt) return { ok: false, error: 'This code has just been fully claimed.' };
    await tell(acct, offer, endsAt);
    return { ok: true, kind: 'free', headline: offer.headline, plan: planName, endsAt };
  } catch (err) {
    console.error('[offers] redeem failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Couldn’t apply the code just now. Try again in a minute.' };
  }
}

// ── Telling people ────────────────────────────────────────────────────────────

function when(endsAt: Date) {
  return {
    date: endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    site: (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, ''),
  };
}

function sendGrantEmail(to: string, type: string, o: { headline: string; plan: string; days: number }, date: string, link: string) {
  sendEmailFireAndForget({
    to,
    subject: `You have the ${o.plan} plan free until ${date}`,
    type,
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">${esc(o.plan)} is yours, free for ${esc(benefitLength(o.days))}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(o.headline)}. You are on the ${esc(o.plan)} plan until <strong>${esc(date)}</strong>.</p>
<p style="margin:0 0 24px">${button(link, 'Go to your dashboard')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">No card is needed and nothing is charged. When the free period ends you move to the Free plan unless you choose to pay; we will remind you before it does.</p>`),
  });
}

// ── Advertising a running offer ───────────────────────────────────────────────

/** The automatic offer to advertise on a portal's sign-up page: the open, public one with the longest free period. */
export async function publicOffer(portal: OfferPortal, now = new Date()): Promise<{ headline: string; placesLeft: number | null; endsAt: Date } | null> {
  try {
    const offers = await prisma.planOffer.findMany({
      where: { portal, trigger: 'AUTO', status: 'ACTIVE', showPublicly: true, startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: [{ benefitDays: 'desc' }, { createdAt: 'asc' }],
      take: 5,
      select: { headline: true, maxRedemptions: true, redeemedCount: true, endsAt: true },
    });
    const open = offers.find((o) => o.maxRedemptions == null || o.redeemedCount < o.maxRedemptions);
    return open ? { headline: open.headline, placesLeft: open.maxRedemptions == null ? null : open.maxRedemptions - open.redeemedCount, endsAt: open.endsAt } : null;
  } catch {
    return null;
  }
}

export const publicEmployerOffer = (now = new Date()) => publicOffer('EMPLOYER', now);

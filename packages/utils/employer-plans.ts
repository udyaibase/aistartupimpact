/** Employer plans. Client-safe: no server imports. Prices are in paise, before 18% GST. */

export type PlanKey = 'FREE' | 'GROWTH' | 'PRO' | 'SCALE';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';

export interface PlanDef {
  key: PlanKey;
  name: string;
  /** Monthly price. Annual is 10 months' price (2 months free). */
  pricePaise: number;
  annualPricePaise: number;
  maxActiveJobs: number;
  aiScreensPerPeriod: number;
  /** People in the workspace, owner included. Null = unlimited. */
  maxSeats: number | null;
  /** Featured badge and higher placement on every open job. */
  featured: boolean;
  /** Every job shared in the Udyaibase newsletter and socials. */
  newsletter: boolean;
  /** The careers widget can hide "Powered by Udyaibase". */
  customBranding: boolean;
  support: string;
  features: string[];
}

export const GST_RATE = 0.18;
export const PLAN_PERIOD_DAYS = 30;
export const ANNUAL_PERIOD_DAYS = 365;
/** A paid plan keeps working this many days after it ends (renew without losing anything). Not after a trial. */
export const GRACE_DAYS = 3;
/** Free trial of TRIAL_PLAN for a new workspace, from its first published job. */
export const TRIAL_DAYS = 7;
export const TRIAL_PLAN: PlanKey = 'PRO';
/** AI reviews included in the trial. */
export const TRIAL_AI_SCREENS = 100;
/** Founding members: the first FOUNDING_LIMIT workspaces on an annual plan get FOUNDING_DISCOUNT off, for FOUNDING_LOCK_MONTHS. */
export const FOUNDING_LIMIT = 50;
export const FOUNDING_DISCOUNT = 0.3;
export const FOUNDING_LOCK_MONTHS = 24;
const DAY_MS = 864e5;

const plan = (d: Omit<PlanDef, 'annualPricePaise'>): PlanDef => ({ ...d, annualPricePaise: d.pricePaise * 10 });

export const PLANS: Record<PlanKey, PlanDef> = {
  FREE: plan({
    key: 'FREE', name: 'Free', pricePaise: 0, maxActiveJobs: 1, aiScreensPerPeriod: 25, maxSeats: 2,
    featured: false, newsletter: false, customBranding: false, support: 'Email',
    features: ['1 open job', 'AI screening for 25 candidates a month', '2 team seats', 'Pipeline, notes, bulk actions and CSV export', 'Careers page and website widget'],
  }),
  GROWTH: plan({
    key: 'GROWTH', name: 'Growth', pricePaise: 249_900, maxActiveJobs: 5, aiScreensPerPeriod: 300, maxSeats: 3,
    featured: false, newsletter: false, customBranding: true, support: 'Email',
    features: ['5 open jobs', 'AI screening for 300 candidates a month', '3 team seats', 'Widget with your branding only', 'Everything in Free'],
  }),
  PRO: plan({
    key: 'PRO', name: 'Pro', pricePaise: 499_900, maxActiveJobs: 15, aiScreensPerPeriod: 1000, maxSeats: 10,
    featured: true, newsletter: false, customBranding: true, support: 'Email, reply within 1 working day',
    features: ['15 open jobs', 'AI screening for 1,000 candidates a month', '10 team seats', 'Featured badge and higher placement on every job', 'Everything in Growth'],
  }),
  SCALE: plan({
    key: 'SCALE', name: 'Scale', pricePaise: 999_900, maxActiveJobs: 40, aiScreensPerPeriod: 3000, maxSeats: null,
    featured: true, newsletter: true, customBranding: true, support: 'Priority, reply within 4 hours',
    features: ['40 open jobs', 'AI screening for 3,000 candidates a month', 'Unlimited team seats', 'Every job shared in the Udyaibase newsletter and socials', 'Everything in Pro'],
  }),
};

export const PAID_PLANS: PlanKey[] = ['GROWTH', 'PRO', 'SCALE'];

/**
 * Stored plan value → plan. Plans renamed in Nov 2026 map to their successors (Featured → Pro, Premium → Scale,
 * which keeps Premium's 50 jobs), so old rows never fall back to Free. Anything unknown is Free.
 */
const LEGACY: Record<string, PlanKey> = { FEATURED: 'PRO', PREMIUM: 'SCALE' };
export function planKeyOf(stored: string | null | undefined): PlanKey {
  if (!stored) return 'FREE';
  if (stored in PLANS) return stored as PlanKey;
  return LEGACY[stored] ?? 'FREE';
}
export function planDef(stored: string | null | undefined): PlanDef {
  const def = PLANS[planKeyOf(stored)];
  return stored === 'PREMIUM' ? { ...def, maxActiveJobs: Math.max(def.maxActiveJobs, 50) } : def;
}

/** Name of the plan a payment was for, as sold at the time (old payments keep their original names). */
export function planSoldName(stored: string): string {
  return stored === 'FEATURED' ? 'Featured' : stored === 'PREMIUM' ? 'Premium' : PLANS[planKeyOf(stored)].name;
}

export const isPaidPlan = (k: string): k is PlanKey => (PAID_PLANS as string[]).includes(k);
export const isBillingCycle = (c: unknown): c is BillingCycle => c === 'MONTHLY' || c === 'ANNUAL';
export const cycleDays = (c: BillingCycle) => (c === 'ANNUAL' ? ANNUAL_PERIOD_DAYS : PLAN_PERIOD_DAYS);

/** Price before GST, GST and total. Founding pricing applies to annual plans only, rounded to whole rupees. */
export function planPrice(key: PlanKey, cycle: BillingCycle = 'MONTHLY', opts: { founding?: boolean } = {}) {
  const def = PLANS[key];
  let amount = cycle === 'ANNUAL' ? def.annualPricePaise : def.pricePaise;
  if (cycle === 'ANNUAL' && opts.founding) amount = Math.round((amount * (1 - FOUNDING_DISCOUNT)) / 100) * 100;
  const gst = Math.round(amount * GST_RATE);
  return { amount, gst, total: amount + gst };
}

type PlanInput = { plan: string; planExpiresAt: Date | string | null; planIsTrial?: boolean | null };

export type PlanPhase = 'free' | 'trial' | 'active' | 'grace';

/**
 * Where an account is in its plan: on a trial, paid and active, in the grace days after a paid plan ended
 * (everything keeps working except new AI reviews), or on Free.
 */
export function planPhase(e: PlanInput, now = Date.now()): { phase: PlanPhase; endsAt: Date | null; graceEndsAt: Date | null } {
  if (planKeyOf(e.plan) === 'FREE' || !e.planExpiresAt) return { phase: 'free', endsAt: null, graceEndsAt: null };
  const end = new Date(e.planExpiresAt);
  if (e.planIsTrial) return end.getTime() > now ? { phase: 'trial', endsAt: end, graceEndsAt: null } : { phase: 'free', endsAt: null, graceEndsAt: null };
  const graceEnd = new Date(end.getTime() + GRACE_DAYS * DAY_MS);
  if (end.getTime() > now) return { phase: 'active', endsAt: end, graceEndsAt: graceEnd };
  if (graceEnd.getTime() > now) return { phase: 'grace', endsAt: end, graceEndsAt: graceEnd };
  return { phase: 'free', endsAt: null, graceEndsAt: null };
}

/** The plan in force: paid plans count through their grace days; after that (or after a trial) it's Free. */
export function effectivePlan(e: PlanInput, now = Date.now()): PlanDef {
  return planPhase(e, now).phase === 'free' ? PLANS.FREE : planDef(e.plan);
}

/** When featured placement bought (or trialled) now should stop: the plan end, plus grace for paid plans. */
export function planFeaturedUntil(e: PlanInput): Date | null {
  if (!e.planExpiresAt) return null;
  const end = new Date(e.planExpiresAt).getTime();
  return new Date(e.planIsTrial ? end : end + GRACE_DAYS * DAY_MS);
}

/**
 * Start of the 30-day window that contains `now` (quota window). Periods are counted back from the
 * plan end, so early renewals (which stack more days) keep the current window; annual plans get a fresh
 * allowance every 30 days.
 */
export function periodStart(planExpiresAt: Date | string | null, now = Date.now()): Date | null {
  if (!planExpiresAt) return null;
  const end = new Date(planExpiresAt).getTime();
  const p = PLAN_PERIOD_DAYS * 864e5;
  const k = Math.max(1, Math.ceil((end - now) / p));
  return new Date(end - k * p);
}

/** Free plan's AI allowance resets on the 1st of each month, India time. */
export function calendarMonthStart(now = Date.now()): Date {
  const IST = 5.5 * 36e5;
  const d = new Date(now + IST);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST);
}

/**
 * Whether a workspace pays the founding price on an annual plan: already a founding member within the lock
 * period and never lapsed to Free since, or a place is still free among the first FOUNDING_LIMIT.
 */
export function foundingEligible(e: { foundingMemberAt: Date | string | null; foundingLostAt: Date | string | null }, membersSoFar: number, now = Date.now()): boolean {
  if (e.foundingLostAt) return false;
  if (e.foundingMemberAt) {
    const until = new Date(e.foundingMemberAt);
    until.setMonth(until.getMonth() + FOUNDING_LOCK_MONTHS);
    return until.getTime() > now;
  }
  return membersSoFar < FOUNDING_LIMIT;
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

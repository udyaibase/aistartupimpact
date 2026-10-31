/** Employer plans. Client-safe: no server imports. Prices are monthly, in paise, before 18% GST. */

export type PlanKey = 'FREE' | 'FEATURED' | 'PREMIUM';

export interface PlanDef {
  key: PlanKey;
  name: string;
  pricePaise: number;
  maxActiveJobs: number;
  aiScreensPerPeriod: number;
  featured: boolean;
  features: string[];
}

export const GST_RATE = 0.18;
export const PLAN_PERIOD_DAYS = 30;
/** A paid plan keeps working this many days after it ends (renew without losing anything). Not after a trial. */
export const GRACE_DAYS = 3;
/** Free Featured trial for a new workspace, from its first published job. */
export const TRIAL_DAYS = 7;
/** AI reviews included in the trial (the paid Featured plan has 300 a month). */
export const TRIAL_AI_SCREENS = 25;
const DAY_MS = 864e5;

export const PLANS: Record<PlanKey, PlanDef> = {
  FREE: {
    key: 'FREE', name: 'Free', pricePaise: 0, maxActiveJobs: 1, aiScreensPerPeriod: 0, featured: false,
    features: ['1 open job', 'Match score on every candidate', 'Website widget', 'Team invites and pipeline'],
  },
  FEATURED: {
    key: 'FEATURED', name: 'Featured', pricePaise: 500_000, maxActiveJobs: 5, aiScreensPerPeriod: 300, featured: true,
    features: ['5 open jobs', 'AI screening for 300 candidates a month', 'Featured badge and higher placement on AI Jobs', 'Everything in Free'],
  },
  PREMIUM: {
    key: 'PREMIUM', name: 'Premium', pricePaise: 1_500_000, maxActiveJobs: 50, aiScreensPerPeriod: 1500, featured: true,
    features: ['50 open jobs', 'AI screening for 1,500 candidates a month', 'Featured placement on every job', 'Roles shared in the Udyaibase newsletter and socials', 'Everything in Featured'],
  },
};

export function planPrice(key: PlanKey) {
  const amount = PLANS[key].pricePaise;
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
  const key = (e.plan in PLANS ? e.plan : 'FREE') as PlanKey;
  if (key === 'FREE' || !e.planExpiresAt) return { phase: 'free', endsAt: null, graceEndsAt: null };
  const end = new Date(e.planExpiresAt);
  if (e.planIsTrial) return end.getTime() > now ? { phase: 'trial', endsAt: end, graceEndsAt: null } : { phase: 'free', endsAt: null, graceEndsAt: null };
  const graceEnd = new Date(end.getTime() + GRACE_DAYS * DAY_MS);
  if (end.getTime() > now) return { phase: 'active', endsAt: end, graceEndsAt: graceEnd };
  if (graceEnd.getTime() > now) return { phase: 'grace', endsAt: end, graceEndsAt: graceEnd };
  return { phase: 'free', endsAt: null, graceEndsAt: null };
}

/** The plan in force: paid plans count through their grace days; after that (or after a trial) it's Free. */
export function effectivePlan(e: PlanInput, now = Date.now()): PlanDef {
  const key = (e.plan in PLANS ? e.plan : 'FREE') as PlanKey;
  return planPhase(e, now).phase === 'free' ? PLANS.FREE : PLANS[key];
}

/** When featured placement bought (or trialled) now should stop: the plan end, plus grace for paid plans. */
export function planFeaturedUntil(e: PlanInput): Date | null {
  if (!e.planExpiresAt) return null;
  const end = new Date(e.planExpiresAt).getTime();
  return new Date(e.planIsTrial ? end : end + GRACE_DAYS * DAY_MS);
}

/**
 * Start of the 30-day window that contains `now` (quota window). Periods are counted back from the
 * plan end, so early renewals (which stack another 30 days) keep the current window.
 */
export function periodStart(planExpiresAt: Date | string | null, now = Date.now()): Date | null {
  if (!planExpiresAt) return null;
  const end = new Date(planExpiresAt).getTime();
  const p = PLAN_PERIOD_DAYS * 864e5;
  const k = Math.max(1, Math.ceil((end - now) / p));
  return new Date(end - k * p);
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

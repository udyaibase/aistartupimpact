/** Event host plans. Client-safe. Prices in paise, before 18% GST. */

export type HostPlanKey = 'FREE' | 'PRO';
export type HostBillingCycle = 'MONTHLY' | 'ANNUAL';

export interface HostPlan {
  key: HostPlanKey;
  name: string;
  pricePaise: number;
  /** Yearly price (Pro only; 0 for Free). */
  annualPricePaise: number;
  /** Published events that haven't ended yet. */
  maxUpcomingEvents: number;
  /** Registrations confirmed per event; more go to the waitlist. */
  registrationsPerEvent: number;
  teamMembers: number;
  /** Fair-use cap on promo emails a period (not advertised as a number while the subscriber list is small). */
  promoEmailsPerPeriod: number;
  featuredEvents: boolean;
  removeBranding: boolean;
  features: string[];
}

export const HOST_PERIOD_DAYS = 30;
export const HOST_ANNUAL_PERIOD_DAYS = 365;
/** Founding hosts: the first HOST_FOUNDING_LIMIT on yearly Pro get HOST_FOUNDING_DISCOUNT off, for HOST_FOUNDING_LOCK_MONTHS. */
export const HOST_FOUNDING_LIMIT = 20;
export const HOST_FOUNDING_DISCOUNT = 0.3;
export const HOST_FOUNDING_LOCK_MONTHS = 24;

export const HOST_PLANS: Record<HostPlanKey, HostPlan> = {
  FREE: {
    key: 'FREE', name: 'Free', pricePaise: 0, annualPricePaise: 0, maxUpcomingEvents: 2, registrationsPerEvent: 100, teamMembers: 2,
    promoEmailsPerPeriod: 0, featuredEvents: false, removeBranding: false,
    features: ['2 upcoming events at a time', '100 registrations per event', 'Website widget, QR check-in and attendee export', '2 teammates'],
  },
  PRO: {
    key: 'PRO', name: 'Pro', pricePaise: 199_900, annualPricePaise: 1_499_000, maxUpcomingEvents: 1000, registrationsPerEvent: 2000, teamMembers: 10,
    promoEmailsPerPeriod: 3, featuredEvents: true, removeBranding: true,
    features: ['Unlimited upcoming events', '2,000 registrations per event', 'Every event featured on Udyaibase Events', 'Email promotion to Udyaibase event subscribers in your city', 'No “Powered by Udyaibase” on your widget', '10 teammates'],
  },
};

/** One-time, per event. */
export const EVENT_BOOST = {
  pricePaise: 79_900,
  registrationsPerEvent: 1000,
  promoEmails: 1,
  features: ['Featured on Udyaibase Events until it ends', 'Up to 1,000 registrations for this event', 'Included in email promotion to Udyaibase event subscribers in your city'],
};

/**
 * Udyaibase's own accounts (showcase and auto-imported events added from the admin app) are not
 * customers: no plan, no limits. Identified by an @udyaibase.com email, which outside users can't sign up with.
 */
export const isPlatformOrganizer = (email?: string | null) => !!email && /@udyaibase\.com$/i.test(email.trim());

/** "No limit" that still fits a Postgres integer (registration limit is passed to SQL). */
const NO_LIMIT = 1_000_000_000;

const PLATFORM_PLAN: HostPlan = {
  ...HOST_PLANS.PRO, name: 'Udyaibase', pricePaise: 0, annualPricePaise: 0, maxUpcomingEvents: NO_LIMIT,
  registrationsPerEvent: NO_LIMIT, teamMembers: 100, promoEmailsPerPeriod: 0, featuredEvents: false, removeBranding: false, features: [],
};

export const isHostBillingCycle = (c: unknown): c is HostBillingCycle => c === 'MONTHLY' || c === 'ANNUAL';
export const hostCycleDays = (c: HostBillingCycle) => (c === 'ANNUAL' ? HOST_ANNUAL_PERIOD_DAYS : HOST_PERIOD_DAYS);

/** Pro's price before GST for a billing cycle; the founding price (yearly only) is rounded to whole rupees. */
export function hostProPricePaise(cycle: HostBillingCycle, opts: { founding?: boolean } = {}): number {
  if (cycle === 'MONTHLY') return HOST_PLANS.PRO.pricePaise;
  const yearly = HOST_PLANS.PRO.annualPricePaise;
  return opts.founding ? Math.round((yearly * (1 - HOST_FOUNDING_DISCOUNT)) / 100) * 100 : yearly;
}

/** Founding price on yearly Pro: within the lock period and never lapsed to Free, or a place left among the first 20. */
export function hostFoundingEligible(o: { foundingMemberAt: Date | string | null; foundingLostAt: Date | string | null }, membersSoFar: number, now = Date.now()): boolean {
  if (o.foundingLostAt) return false;
  if (o.foundingMemberAt) {
    const until = new Date(o.foundingMemberAt);
    until.setMonth(until.getMonth() + HOST_FOUNDING_LOCK_MONTHS);
    return until.getTime() > now;
  }
  return membersSoFar < HOST_FOUNDING_LIMIT;
}

/** Pro keeps working this many days after it ends (promo emails pause), like employer plans. */
export const HOST_GRACE_DAYS = 3;

export function hostPlanPhase(o: { plan: string; planExpiresAt: Date | string | null }, now = Date.now()): { phase: 'free' | 'active' | 'grace'; endsAt: Date | null; graceEndsAt: Date | null } {
  if (o.plan !== 'PRO' || !o.planExpiresAt) return { phase: 'free', endsAt: null, graceEndsAt: null };
  const end = new Date(o.planExpiresAt);
  const graceEnd = new Date(end.getTime() + HOST_GRACE_DAYS * 864e5);
  if (end.getTime() > now) return { phase: 'active', endsAt: end, graceEndsAt: graceEnd };
  if (graceEnd.getTime() > now) return { phase: 'grace', endsAt: end, graceEndsAt: graceEnd };
  return { phase: 'free', endsAt: null, graceEndsAt: null };
}

export function effectiveHostPlan(o: { plan: string; planExpiresAt: Date | string | null; email?: string | null }, now = Date.now()): HostPlan {
  if (isPlatformOrganizer(o.email)) return PLATFORM_PLAN;
  return hostPlanPhase(o, now).phase === 'free' ? HOST_PLANS.FREE : HOST_PLANS.PRO;
}

/** Registration limit for one event: the plan's, raised by a Boost, and never above the host's own capacity. */
export function registrationLimit(plan: HostPlan, event: { boostedAt: Date | string | null; capacity: number | null }): number {
  if (plan === PLATFORM_PLAN) return event.capacity ?? NO_LIMIT;
  const planCap = event.boostedAt ? Math.max(plan.registrationsPerEvent, EVENT_BOOST.registrationsPerEvent) : plan.registrationsPerEvent;
  return event.capacity != null ? Math.min(event.capacity, planCap) : planCap;
}

export function hostPeriodStart(planExpiresAt: Date | string | null, now = Date.now()): Date | null {
  if (!planExpiresAt) return null;
  const end = new Date(planExpiresAt).getTime();
  const p = HOST_PERIOD_DAYS * 864e5;
  return new Date(end - Math.max(1, Math.ceil((end - now) / p)) * p);
}

/**
 * Why a full event is full: the host's own capacity, or their plan's registration cap.
 * Only the plan cap can be lifted by the host (Boost or Pro), so only that one is worth telling them about.
 */
export function waitlistReason(plan: HostPlan, event: { boostedAt: Date | string | null; capacity: number | null }): 'capacity' | 'plan_limit' {
  if (plan === PLATFORM_PLAN) return 'capacity';
  const planCap = registrationLimit(plan, { boostedAt: event.boostedAt, capacity: null });
  return event.capacity != null && event.capacity <= planCap ? 'capacity' : 'plan_limit';
}

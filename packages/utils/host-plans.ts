/** Event host plans. Client-safe. Prices in paise, before 18% GST. */

export type HostPlanKey = 'FREE' | 'PRO';

export interface HostPlan {
  key: HostPlanKey;
  name: string;
  pricePaise: number;
  /** Published events that haven't ended yet. */
  maxUpcomingEvents: number;
  /** Registrations confirmed per event; more go to the waitlist. */
  registrationsPerEvent: number;
  teamMembers: number;
  promoEmailsPerPeriod: number;
  featuredEvents: boolean;
  removeBranding: boolean;
  features: string[];
}

export const HOST_PERIOD_DAYS = 30;

export const HOST_PLANS: Record<HostPlanKey, HostPlan> = {
  FREE: {
    key: 'FREE', name: 'Free', pricePaise: 0, maxUpcomingEvents: 3, registrationsPerEvent: 200, teamMembers: 2,
    promoEmailsPerPeriod: 0, featuredEvents: false, removeBranding: false,
    features: ['3 upcoming events at a time', '200 registrations per event', 'Website widget, QR check-in and attendee export', '2 teammates'],
  },
  PRO: {
    key: 'PRO', name: 'Pro', pricePaise: 199_900, maxUpcomingEvents: 1000, registrationsPerEvent: 2000, teamMembers: 10,
    promoEmailsPerPeriod: 3, featuredEvents: true, removeBranding: true,
    features: ['Unlimited upcoming events', '2,000 registrations per event', 'Every event featured on Udyaibase Events', '3 promo emails a month to nearby subscribers', 'No “Powered by Udyaibase” on your widget', '10 teammates'],
  },
};

/** One-time, per event. */
export const EVENT_BOOST = {
  pricePaise: 79_900,
  registrationsPerEvent: 1000,
  promoEmails: 1,
  features: ['Featured on Udyaibase Events until it ends', '1 promo email to subscribers near the event', 'Up to 1,000 registrations'],
};

/**
 * Udyaibase's own accounts (showcase and auto-imported events added from the admin app) are not
 * customers: no plan, no limits. Identified by an @udyaibase.com email, which outside users can't sign up with.
 */
export const isPlatformOrganizer = (email?: string | null) => !!email && /@udyaibase\.com$/i.test(email.trim());

/** "No limit" that still fits a Postgres integer (registration limit is passed to SQL). */
const NO_LIMIT = 1_000_000_000;

const PLATFORM_PLAN: HostPlan = {
  ...HOST_PLANS.PRO, name: 'Udyaibase', pricePaise: 0, maxUpcomingEvents: NO_LIMIT,
  registrationsPerEvent: NO_LIMIT, teamMembers: 100, promoEmailsPerPeriod: 0, featuredEvents: false, removeBranding: false, features: [],
};

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

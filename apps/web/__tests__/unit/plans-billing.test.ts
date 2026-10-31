import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { effectivePlan, GRACE_DAYS, periodStart, planFeaturedUntil, planPhase, planPrice } from '@/lib/employer/plans';
import { effectiveHostPlan, hostPlanPhase, registrationLimit, isPlatformOrganizer, HOST_PLANS, EVENT_BOOST } from '@/lib/events/plans';
import { withGst } from '@/lib/billing/razorpay';
import { splitTicket, ticketFeePct } from '@/lib/events/tickets';
import { validatePayoutInput } from '@/lib/events/payouts';

const DAY = 864e5;

describe('employer plans', () => {
  it('paid plans keep working for 3 grace days after they end; then Free', () => {
    const now = Date.now();
    const at = (hoursFromNow: number) => new Date(now + hoursFromNow * 36e5);
    expect(effectivePlan({ plan: 'PREMIUM', planExpiresAt: at(24) }).key).toBe('PREMIUM');
    expect(planPhase({ plan: 'FEATURED', planExpiresAt: at(-1) }).phase).toBe('grace');
    expect(effectivePlan({ plan: 'FEATURED', planExpiresAt: at(-1) }).key).toBe('FEATURED');
    expect(effectivePlan({ plan: 'FEATURED', planExpiresAt: at(-73) }).key).toBe('FREE');
    expect(effectivePlan({ plan: 'PREMIUM', planExpiresAt: null }).key).toBe('FREE');
  });

  it('a trial has no grace: it ends exactly on its date; featured placement follows the same rule', () => {
    const now = Date.now();
    expect(planPhase({ plan: 'FEATURED', planExpiresAt: new Date(now + 36e5), planIsTrial: true }).phase).toBe('trial');
    expect(effectivePlan({ plan: 'FEATURED', planExpiresAt: new Date(now - 1000), planIsTrial: true }).key).toBe('FREE');
    const end = new Date(now + 10 * DAY);
    expect(planFeaturedUntil({ plan: 'FEATURED', planExpiresAt: end, planIsTrial: true })!.getTime()).toBe(end.getTime());
    expect(planFeaturedUntil({ plan: 'FEATURED', planExpiresAt: end })!.getTime()).toBe(end.getTime() + GRACE_DAYS * DAY);
  });

  it('host Pro: active, grace, then Free (Udyaibase accounts never lapse)', () => {
    const now = Date.now();
    expect(hostPlanPhase({ plan: 'PRO', planExpiresAt: new Date(now - 36e5) }).phase).toBe('grace');
    expect(effectiveHostPlan({ plan: 'PRO', planExpiresAt: new Date(now - 36e5), email: 'host@x.in' }).key).toBe('PRO');
    expect(effectiveHostPlan({ plan: 'PRO', planExpiresAt: new Date(now - 4 * DAY), email: 'host@x.in' }).key).toBe('FREE');
  });

  it('quota window: early renewal (60 days left) keeps the current 30-day window', () => {
    const now = Date.now();
    const start = periodStart(new Date(now + 60 * DAY), now)!.getTime();
    expect(start).toBeLessThanOrEqual(now);
    expect(now - start).toBeLessThan(30 * DAY);
  });

  it('adds 18% GST in paise', () => {
    expect(planPrice('FEATURED')).toEqual({ amount: 500000, gst: 90000, total: 590000 });
    expect(withGst(79900)).toEqual({ amount: 79900, gst: 14382, total: 94282 });
  });
});

describe('event host plans', () => {
  it('Udyaibase accounts have no plan limits', () => {
    expect(isPlatformOrganizer('events@udyaibase.com')).toBe(true);
    expect(isPlatformOrganizer('host@example.com')).toBe(false);
    const plan = effectiveHostPlan({ plan: 'FREE', planExpiresAt: null, email: 'events@udyaibase.com' });
    expect(registrationLimit(plan, { boostedAt: null, capacity: null })).toBeGreaterThan(100_000);
    expect(registrationLimit(plan, { boostedAt: null, capacity: 50 })).toBe(50);
  });

  it('Free: 200 per event; a Boost raises it; the host capacity always wins when lower', () => {
    const free = HOST_PLANS.FREE;
    expect(registrationLimit(free, { boostedAt: null, capacity: null })).toBe(200);
    expect(registrationLimit(free, { boostedAt: new Date(), capacity: null })).toBe(EVENT_BOOST.registrationsPerEvent);
    expect(registrationLimit(free, { boostedAt: new Date(), capacity: 80 })).toBe(80);
  });
});

describe('paid tickets', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('splits 5% to Udyaibase by default, the rest to the host', () => {
    expect(splitTicket(50000)).toEqual({ amount: 50000, fee: 2500, hostShare: 47500 });
  });
  it('fee is configurable but bounded', () => {
    vi.stubEnv('TICKET_PLATFORM_FEE_PCT', '8');
    expect(ticketFeePct()).toBe(8);
    vi.stubEnv('TICKET_PLATFORM_FEE_PCT', '90');
    expect(ticketFeePct()).toBe(5);
  });
  it('validates payout details before anything is sent to Razorpay', () => {
    const ok = { legalName: 'A', businessType: 'individual', contactName: 'A', phone: '9876543210', pan: 'ABCDE1234F', street: 'x', city: 'y', state: 'z', postalCode: '560001', accountNumber: '123456789012', ifsc: 'HDFC0001234', beneficiaryName: 'A', acceptTerms: true };
    expect(validatePayoutInput(ok).ok).toBe(true);
    expect(validatePayoutInput({ ...ok, pan: 'NOPE' }).ok).toBe(false);
    expect(validatePayoutInput({ ...ok, ifsc: 'HDFC1234' }).ok).toBe(false);
    expect(validatePayoutInput({ ...ok, acceptTerms: false }).ok).toBe(false);
  });
});

describe('why an event is full (waitlist reason)', () => {
  it('plan cap below the host capacity (or no capacity) is the plan limit; only that is worth telling the host', async () => {
    const { waitlistReason, HOST_PLANS: P, isPlatformOrganizer: _ } = await import('@/lib/events/plans');
    expect(waitlistReason(P.FREE, { boostedAt: null, capacity: null })).toBe('plan_limit');
    expect(waitlistReason(P.FREE, { boostedAt: null, capacity: 500 })).toBe('plan_limit');
    expect(waitlistReason(P.FREE, { boostedAt: null, capacity: 150 })).toBe('capacity');
    expect(waitlistReason(P.FREE, { boostedAt: new Date(), capacity: 500 })).toBe('capacity');
  });
  it('Udyaibase’s own events never hit a plan limit', async () => {
    const { waitlistReason, effectiveHostPlan } = await import('@/lib/events/plans');
    expect(waitlistReason(effectiveHostPlan({ plan: 'FREE', planExpiresAt: null, email: 'events@udyaibase.com' }), { boostedAt: null, capacity: null })).toBe('capacity');
  });
});

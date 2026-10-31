import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { calendarMonthStart, effectivePlan, foundingEligible, FOUNDING_LIMIT, GRACE_DAYS, periodStart, planDef, planFeaturedUntil, planKeyOf, planPhase, planPrice, planSoldName, PLANS } from '@/lib/employer/plans';
import { effectiveHostPlan, hostFoundingEligible, HOST_FOUNDING_LIMIT, hostPlanPhase, hostProPricePaise, registrationLimit, isPlatformOrganizer, HOST_PLANS, EVENT_BOOST } from '@/lib/events/plans';
import { withGst } from '@/lib/billing/razorpay';
import { splitTicket, ticketFeePct } from '@/lib/events/tickets';
import { validatePayoutInput } from '@/lib/events/payouts';

const DAY = 864e5;

describe('employer plans', () => {
  it('paid plans keep working for 3 grace days after they end; then Free', () => {
    const now = Date.now();
    const at = (hoursFromNow: number) => new Date(now + hoursFromNow * 36e5);
    expect(effectivePlan({ plan: 'SCALE', planExpiresAt: at(24) }).key).toBe('SCALE');
    expect(planPhase({ plan: 'PRO', planExpiresAt: at(-1) }).phase).toBe('grace');
    expect(effectivePlan({ plan: 'PRO', planExpiresAt: at(-1) }).key).toBe('PRO');
    expect(effectivePlan({ plan: 'GROWTH', planExpiresAt: at(-73) }).key).toBe('FREE');
    expect(effectivePlan({ plan: 'SCALE', planExpiresAt: null }).key).toBe('FREE');
  });

  it('a trial has no grace: it ends exactly on its date; featured placement follows the same rule', () => {
    const now = Date.now();
    expect(planPhase({ plan: 'PRO', planExpiresAt: new Date(now + 36e5), planIsTrial: true }).phase).toBe('trial');
    expect(effectivePlan({ plan: 'PRO', planExpiresAt: new Date(now - 1000), planIsTrial: true }).key).toBe('FREE');
    const end = new Date(now + 10 * DAY);
    expect(planFeaturedUntil({ plan: 'PRO', planExpiresAt: end, planIsTrial: true })!.getTime()).toBe(end.getTime());
    expect(planFeaturedUntil({ plan: 'PRO', planExpiresAt: end })!.getTime()).toBe(end.getTime() + GRACE_DAYS * DAY);
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

  it('old plan names map to their successors and keep their names on invoices', () => {
    const at = new Date(Date.now() + DAY);
    expect(planKeyOf('FEATURED')).toBe('PRO');
    expect(planKeyOf('PREMIUM')).toBe('SCALE');
    expect(planKeyOf('NONSENSE')).toBe('FREE');
    expect(effectivePlan({ plan: 'FEATURED', planExpiresAt: at }).key).toBe('PRO');
    expect(planDef('PREMIUM').maxActiveJobs).toBe(50); // Premium customers keep their 50 jobs
    expect(planSoldName('FEATURED')).toBe('Featured');
    expect(planSoldName('GROWTH')).toBe('Growth');
  });

  it('plan limits match the published pricing', () => {
    expect([PLANS.FREE, PLANS.GROWTH, PLANS.PRO, PLANS.SCALE].map((p) => [p.maxActiveJobs, p.aiScreensPerPeriod, p.maxSeats])).toEqual([
      [1, 25, 2], [5, 300, 3], [15, 1000, 10], [40, 3000, null],
    ]);
    expect(PLANS.FREE.customBranding).toBe(false);
    expect(PLANS.GROWTH.featured).toBe(false);
    expect(PLANS.PRO.featured && !PLANS.PRO.newsletter).toBe(true);
    expect(PLANS.SCALE.newsletter).toBe(true);
  });

  it('prices: monthly, annual (10 months) and founding (30% off annual), with 18% GST', () => {
    expect(planPrice('GROWTH')).toEqual({ amount: 249900, gst: 44982, total: 294882 });
    expect(planPrice('PRO', 'ANNUAL')).toEqual({ amount: 4999000, gst: 899820, total: 5898820 });
    expect(planPrice('SCALE', 'ANNUAL').total).toBe(11798820); // ₹1,17,988.20
    expect(planPrice('GROWTH', 'ANNUAL', { founding: true }).amount).toBe(1749300); // ₹17,493
    expect(planPrice('GROWTH', 'MONTHLY', { founding: true }).amount).toBe(249900); // founding is annual only
  });

  it('founding price: first 50, held 24 months, lost after a lapse', () => {
    const now = Date.now();
    expect(foundingEligible({ foundingMemberAt: null, foundingLostAt: null }, FOUNDING_LIMIT - 1, now)).toBe(true);
    expect(foundingEligible({ foundingMemberAt: null, foundingLostAt: null }, FOUNDING_LIMIT, now)).toBe(false);
    expect(foundingEligible({ foundingMemberAt: new Date(now - 300 * DAY), foundingLostAt: null }, 999, now)).toBe(true);
    expect(foundingEligible({ foundingMemberAt: new Date(now - 800 * DAY), foundingLostAt: null }, 0, now)).toBe(false);
    expect(foundingEligible({ foundingMemberAt: new Date(now - 10 * DAY), foundingLostAt: new Date(now) }, 0, now)).toBe(false);
  });

  it('Free AI allowance resets on the 1st of the month, India time', () => {
    // 1 Nov 2026 03:00 IST = 31 Oct 2026 21:30 UTC → month starts 31 Oct 18:30 UTC
    expect(calendarMonthStart(Date.UTC(2026, 9, 31, 21, 30)).toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(calendarMonthStart(Date.UTC(2026, 9, 15)).toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  it('adds 18% GST in paise', () => {
    expect(planPrice('PRO')).toEqual({ amount: 499900, gst: 89982, total: 589882 });
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

  it('Free: 2 upcoming events and 100 per event; a Boost raises that event only; the host capacity always wins when lower', () => {
    const free = HOST_PLANS.FREE;
    expect(free.maxUpcomingEvents).toBe(2);
    expect(registrationLimit(free, { boostedAt: null, capacity: null })).toBe(100);
    expect(registrationLimit(free, { boostedAt: new Date(), capacity: null })).toBe(EVENT_BOOST.registrationsPerEvent);
    expect(registrationLimit(free, { boostedAt: new Date(), capacity: 80 })).toBe(80);
  });

  it('Pro: ₹1,999 a month or ₹14,990 a year; founding hosts pay 30% less yearly', () => {
    expect(hostProPricePaise('MONTHLY')).toBe(199900);
    expect(hostProPricePaise('ANNUAL')).toBe(1499000);
    expect(hostProPricePaise('ANNUAL', { founding: true })).toBe(1049300); // ₹10,493
    expect(hostProPricePaise('MONTHLY', { founding: true })).toBe(199900);
  });

  it('founding hosts: first 20, held 24 months, lost after a lapse', () => {
    const now = Date.now();
    expect(hostFoundingEligible({ foundingMemberAt: null, foundingLostAt: null }, HOST_FOUNDING_LIMIT - 1, now)).toBe(true);
    expect(hostFoundingEligible({ foundingMemberAt: null, foundingLostAt: null }, HOST_FOUNDING_LIMIT, now)).toBe(false);
    expect(hostFoundingEligible({ foundingMemberAt: new Date(now - 400 * DAY), foundingLostAt: null }, 99, now)).toBe(true);
    expect(hostFoundingEligible({ foundingMemberAt: new Date(now - 800 * DAY), foundingLostAt: null }, 0, now)).toBe(false);
    expect(hostFoundingEligible({ foundingMemberAt: new Date(now - DAY), foundingLostAt: new Date(now) }, 0, now)).toBe(false);
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
    expect(waitlistReason(P.FREE, { boostedAt: null, capacity: 150 })).toBe('plan_limit'); // Free allows 100
    expect(waitlistReason(P.FREE, { boostedAt: null, capacity: 80 })).toBe('capacity');
    expect(waitlistReason(P.FREE, { boostedAt: new Date(), capacity: 500 })).toBe('capacity');
  });
  it('Udyaibase’s own events never hit a plan limit', async () => {
    const { waitlistReason, effectiveHostPlan } = await import('@/lib/events/plans');
    expect(waitlistReason(effectiveHostPlan({ plan: 'FREE', planExpiresAt: null, email: 'events@udyaibase.com' }), { boostedAt: null, capacity: null })).toBe('capacity');
  });
});

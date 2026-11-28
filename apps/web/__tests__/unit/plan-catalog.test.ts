import { afterEach, describe, expect, it, vi } from 'vitest';
import * as employerPlans from '@udyaibase/utils/employer-plans';
import { PLANS, foundingEligible, planPrice } from '@udyaibase/utils/employer-plans';
import * as hostPlans from '@udyaibase/utils/host-plans';
import { EVENT_BOOST, EVENT_CERTIFICATES, HOST_PLANS, TICKET_FEE, hostProPricePaise } from '@udyaibase/utils/host-plans';
import { PACKS } from '@udyaibase/utils/funding-packs';
import { BUILT_IN_CATALOG, applyCatalog, catalogChanges, currentCatalog, validateCatalog, type PlanCatalog } from '@udyaibase/utils/catalog';
import { makeCatalogLoader } from '@udyaibase/utils/catalog-loader';

const copy = (): PlanCatalog => JSON.parse(JSON.stringify(BUILT_IN_CATALOG));
const edit = (f: (c: PlanCatalog) => void): PlanCatalog => { const c = copy(); f(c); return c; };
const failAt = (c: PlanCatalog) => { const r = validateCatalog(c); return r.ok ? 'ok' : r.path; };

afterEach(() => applyCatalog(null));

describe('the built-in catalog', () => {
  it('passes its own checks, so the admin form opens valid', () => {
    expect(validateCatalog(BUILT_IN_CATALOG).ok).toBe(true);
  });
  it('matches what the code ships with', () => {
    expect(BUILT_IN_CATALOG.employer.PRO).toMatchObject({ pricePaise: 499_900, annualPricePaise: 4_999_000, maxActiveJobs: 15 });
    expect(BUILT_IN_CATALOG.host.PRO.pricePaise).toBe(199_900);
    expect(BUILT_IN_CATALOG.funding.FULL).toEqual({ totalPaise: 399_900, limit: null });
  });
});

describe('putting a catalog in force', () => {
  it('changes what every reader of the plans sees: prices, limits, feature lines', () => {
    applyCatalog(edit((c) => { c.employer.PRO.pricePaise = 599_900; c.employer.PRO.annualPricePaise = 5_999_000; c.employer.PRO.maxActiveJobs = 20; c.employer.PRO.features = ['20 open jobs']; c.host.PRO.pricePaise = 249_900; c.boost.pricePaise = 99_900; c.funding.STARTER.totalPaise = 29_900; }));
    expect(PLANS.PRO.pricePaise).toBe(599_900);
    expect(planPrice('PRO', 'MONTHLY')).toEqual({ amount: 599_900, gst: 107_982, total: 707_882 });
    expect(planPrice('PRO', 'ANNUAL').amount).toBe(5_999_000);
    expect(PLANS.PRO.maxActiveJobs).toBe(20);
    expect(PLANS.PRO.features).toEqual(['20 open jobs']);
    expect(hostProPricePaise('MONTHLY')).toBe(249_900);
    expect(EVENT_BOOST.pricePaise).toBe(99_900);
    expect(PACKS.STARTER.totalPaise).toBe(29_900);
  });

  it('leaves what a plan unlocks alone: only numbers and feature lines change', () => {
    applyCatalog(edit((c) => { c.employer.PRO.pricePaise = 599_900; c.employer.PRO.annualPricePaise = 5_999_000; }));
    expect(PLANS.PRO).toMatchObject({ key: 'PRO', name: 'Pro', featured: true, customBranding: true });
    expect(PACKS.FULL).toMatchObject({ name: 'Full Dataset', accessDays: 365 });
  });

  it('goes back to the built-in values, with nothing left over from the version before', () => {
    applyCatalog(edit((c) => { c.employer.GROWTH.maxActiveJobs = 9; c.boost.pricePaise = 99_900; }));
    applyCatalog(null);
    expect(currentCatalog()).toEqual(BUILT_IN_CATALOG);
    applyCatalog(edit((c) => { c.boost.pricePaise = 99_900; }));
    expect(PLANS.GROWTH.maxActiveJobs).toBe(BUILT_IN_CATALOG.employer.GROWTH.maxActiveJobs);
  });
});

describe('checking a catalog before it is saved', () => {
  it('keeps the Free plans free', () => {
    expect(failAt(edit((c) => { c.employer.FREE.pricePaise = 100; }))).toBe('employer.FREE.pricePaise');
    expect(failAt(edit((c) => { c.host.FREE.pricePaise = 100; }))).toBe('host.FREE.pricePaise');
  });
  it('wants whole rupees and never a paid plan at ₹0', () => {
    expect(failAt(edit((c) => { c.employer.GROWTH.pricePaise = 249_950; }))).toBe('employer.GROWTH.pricePaise');
    expect(failAt(edit((c) => { c.employer.GROWTH.pricePaise = 0; }))).toBe('employer.GROWTH.pricePaise');
    expect(failAt(edit((c) => { c.funding.STARTER.totalPaise = 0; }))).toBe('funding.STARTER.totalPaise');
  });
  it('makes yearly cheaper than twelve months but dearer than one', () => {
    expect(failAt(edit((c) => { c.employer.PRO.annualPricePaise = c.employer.PRO.pricePaise * 12; }))).toBe('employer.PRO.annualPricePaise');
    expect(failAt(edit((c) => { c.employer.PRO.annualPricePaise = c.employer.PRO.pricePaise; }))).toBe('employer.PRO.annualPricePaise');
    expect(failAt(edit((c) => { c.host.PRO.annualPricePaise = c.host.PRO.pricePaise * 12; }))).toBe('host.PRO.annualPricePaise');
  });
  it('keeps each plan worth more than the one below it', () => {
    expect(failAt(edit((c) => { c.employer.PRO.pricePaise = c.employer.GROWTH.pricePaise; c.employer.PRO.annualPricePaise = c.employer.GROWTH.annualPricePaise + 100_000; }))).toBe('employer.PRO.pricePaise');
    expect(failAt(edit((c) => { c.employer.SCALE.maxActiveJobs = 3; }))).toBe('employer.SCALE.maxActiveJobs');
    expect(failAt(edit((c) => { c.employer.PRO.maxSeats = 1; }))).toBe('employer.PRO.maxSeats');
    expect(failAt(edit((c) => { c.host.PRO.registrationsPerEvent = 50; }))).toBe('host.PRO.registrationsPerEvent');
    expect(failAt(edit((c) => { c.funding.PRO.totalPaise = c.funding.GROWTH.totalPaise; }))).toBe('funding.PRO.totalPaise');
    expect(failAt(edit((c) => { c.funding.GROWTH.limit = 10; }))).toBe('funding.GROWTH.limit');
  });
  it('allows unlimited seats only where the plans below allow it too', () => {
    expect(failAt(edit((c) => { c.employer.PRO.maxSeats = null; }))).toBe('ok'); // Scale above it is already unlimited
    expect(failAt(edit((c) => { c.employer.GROWTH.maxSeats = null; }))).toBe('employer.PRO.maxSeats');
  });
  it('needs feature lines, within the page’s limits', () => {
    expect(failAt(edit((c) => { c.employer.PRO.features = ['  ']; }))).toBe('employer.PRO.features');
    expect(failAt(edit((c) => { c.host.PRO.features = Array(9).fill('Line'); }))).toBe('host.PRO.features');
    const r = validateCatalog(edit((c) => { c.employer.PRO.features = ['  15   open jobs ', '']; }));
    expect(r.ok && r.data.employer.PRO.features).toEqual(['15 open jobs']);
  });
  it('keeps the full dataset as everything, whatever is sent', () => {
    const r = validateCatalog(edit((c) => { (c.funding.FULL as { limit: number | null }).limit = 5; }));
    expect(r.ok && r.data.funding.FULL.limit).toBeNull();
  });
  it('rejects a catalog with a plan missing, or rubbish', () => {
    expect(validateCatalog({}).ok).toBe(false);
    expect(validateCatalog(null).ok).toBe(false);
    const c = copy() as unknown as { employer: Record<string, unknown> };
    delete c.employer.SCALE;
    expect(validateCatalog(c).ok).toBe(false);
  });
});

describe('what changed between two catalogs', () => {
  it('lists each changed value in plain words, and nothing else', () => {
    const after = edit((c) => { c.employer.PRO.pricePaise = 599_900; c.employer.PRO.annualPricePaise = 5_999_000; c.employer.PRO.maxSeats = null; c.boost.pricePaise = 99_900; c.funding.STARTER.limit = 60; });
    expect(catalogChanges(BUILT_IN_CATALOG, after)).toEqual([
      { path: 'employer.PRO.pricePaise', label: 'Hiring Pro: monthly price', from: '₹4,999', to: '₹5,999' },
      { path: 'employer.PRO.annualPricePaise', label: 'Hiring Pro: yearly price', from: '₹49,990', to: '₹59,990' },
      { path: 'employer.PRO.maxSeats', label: 'Hiring Pro: team seats', from: '10', to: 'Unlimited' },
      { path: 'funding.STARTER.limit', label: 'Funding data Starter: startups in the pack', from: '50', to: '60' },
      { path: 'boost.pricePaise', label: 'Event Boost: price', from: '₹799', to: '₹999' },
    ]);
    expect(catalogChanges(BUILT_IN_CATALOG, copy())).toEqual([]);
  });
});

describe('loading the version in force', () => {
  const higher = edit((c) => { c.employer.PRO.pricePaise = 599_900; c.employer.PRO.annualPricePaise = 5_999_000; });
  const db = (row: unknown) => ({ planCatalogVersion: { findFirst: vi.fn(async (_a: unknown) => row as { id: string; data: unknown } | null) } });

  it('applies the saved version, and asks the database again only after a minute', async () => {
    let t = 1_000_000;
    const d = db({ id: 'v1', data: higher });
    const loader = makeCatalogLoader(d, { now: () => t });
    await loader.ensure();
    expect(PLANS.PRO.pricePaise).toBe(599_900);
    expect(loader.versionInForce()).toBe('v1');
    await loader.ensure(); t += 30_000; await loader.ensure();
    expect(d.planCatalogVersion.findFirst).toHaveBeenCalledTimes(1);
    t += 31_000; await loader.ensure();
    expect(d.planCatalogVersion.findFirst).toHaveBeenCalledTimes(2);
  });

  it('reads fresh at checkout, whatever it remembers', async () => {
    const d = db({ id: 'v1', data: higher });
    const loader = makeCatalogLoader(d, { now: () => 5 });
    await loader.ensure();
    await loader.ensure({ fresh: true });
    expect(d.planCatalogVersion.findFirst).toHaveBeenCalledTimes(2);
  });

  it('only asks for versions whose start time has passed, newest first', async () => {
    const d = db(null);
    await makeCatalogLoader(d, { now: () => Date.parse('2026-12-05T06:00:00Z') }).ensure();
    const arg = d.planCatalogVersion.findFirst.mock.calls[0][0] as { where: { effectiveFrom: { lte: Date } }; orderBy: unknown[] };
    expect(arg.where.effectiveFrom.lte.toISOString()).toBe('2026-12-05T06:00:00.000Z');
    expect(arg.orderBy[0]).toEqual({ effectiveFrom: 'desc' });
  });

  it('uses the built-in values when nothing is saved, the table is missing, or a version is no longer valid', async () => {
    await makeCatalogLoader(db(null)).ensure();
    expect(currentCatalog()).toEqual(BUILT_IN_CATALOG);
    const missing = { planCatalogVersion: { findFirst: vi.fn(async () => { throw Object.assign(new Error('no table'), { code: 'P2021' }); }) } };
    await expect(makeCatalogLoader(missing).ensure()).resolves.toBeUndefined();
    expect(currentCatalog()).toEqual(BUILT_IN_CATALOG);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    await makeCatalogLoader(db({ id: 'bad', data: { employer: {} } })).ensure();
    expect(currentCatalog()).toEqual(BUILT_IN_CATALOG);
    quiet.mockRestore();
  });

  it('goes back to the built-in values when the version in force is removed', async () => {
    let row: unknown = { id: 'v1', data: higher };
    const d = { planCatalogVersion: { findFirst: vi.fn(async () => row as { id: string; data: unknown } | null) } };
    const loader = makeCatalogLoader(d);
    await loader.ensure();
    expect(PLANS.PRO.pricePaise).toBe(599_900);
    row = null;
    await loader.ensure({ fresh: true });
    expect(PLANS.PRO.pricePaise).toBe(499_900);
  });
});

describe('the rules around plans', () => {
  it('are part of the built-in catalog, as the product ships them', () => {
    expect(BUILT_IN_CATALOG.rules).toEqual({
      employer: { graceDays: 3, trialDays: 14, trialPlan: 'PRO', trialAiScreens: 100, foundingLimit: 50, foundingDiscountPct: 30, foundingLockMonths: 24 },
      host: { graceDays: 3, foundingLimit: 20, foundingDiscountPct: 30, foundingLockMonths: 24 },
      certificatePricePaise: 49_900, ticketFeePct: null,
    });
  });

  it('change what the product reads: trial, grace, founding price, certificates and ticket fee', () => {
    applyCatalog(edit((c) => {
      c.rules.employer = { graceDays: 7, trialDays: 30, trialPlan: 'GROWTH', trialAiScreens: 250, foundingLimit: 100, foundingDiscountPct: 40, foundingLockMonths: 12 };
      c.rules.host = { graceDays: 5, foundingLimit: 0, foundingDiscountPct: 20, foundingLockMonths: 6 };
      c.rules.certificatePricePaise = 79_900; c.rules.ticketFeePct = 7.5;
    }));
    // Read through the module, the way every caller does: these are live values, not copies.
    expect(employerPlans.TRIAL_DAYS).toBe(30);
    expect(employerPlans.TRIAL_PLAN).toBe('GROWTH');
    expect(employerPlans.TRIAL_AI_SCREENS).toBe(250);
    expect(employerPlans.GRACE_DAYS).toBe(7);
    expect(employerPlans.FOUNDING_LIMIT).toBe(100);
    expect(employerPlans.FOUNDING_DISCOUNT).toBeCloseTo(0.4);
    expect(hostPlans.HOST_GRACE_DAYS).toBe(5);
    expect(hostPlans.HOST_FOUNDING_LIMIT).toBe(0);
    expect(EVENT_CERTIFICATES.pricePaise).toBe(79_900);
    expect(TICKET_FEE.pct).toBe(7.5);
    // And the sums built on them follow.
    expect(planPrice('PRO', 'ANNUAL', { founding: true }).amount).toBe(Math.round((4_999_000 * 0.6) / 100) * 100);
    expect(foundingEligible({ foundingMemberAt: null, foundingLostAt: null }, 60)).toBe(true); // 60 taken, 100 places
    expect(hostPlans.hostFoundingEligible({ foundingMemberAt: null, foundingLostAt: null }, 0)).toBe(false); // closed to newcomers
    expect(hostProPricePaise('ANNUAL', { founding: true })).toBe(Math.round((1_499_000 * 0.8) / 100) * 100);
  });

  it('go back to the built-in values with everything else', () => {
    applyCatalog(edit((c) => { c.rules.employer.trialDays = 0; c.rules.ticketFeePct = 10; }));
    applyCatalog(null);
    expect(employerPlans.TRIAL_DAYS).toBe(14);
    expect(TICKET_FEE.pct).toBeNull();
  });

  it('are checked: sensible ranges, a real plan for the trial, whole rupees', () => {
    expect(failAt(edit((c) => { c.rules.employer.trialDays = 120; }))).toBe('rules.employer.trialDays');
    expect(failAt(edit((c) => { c.rules.employer.trialDays = 0; }))).toBe('ok'); // 0 switches the trial off
    expect(failAt(edit((c) => { (c.rules.employer as { trialPlan: string }).trialPlan = 'FREE'; }))).toBe('rules.employer.trialPlan');
    expect(failAt(edit((c) => { c.rules.employer.foundingDiscountPct = 100; }))).toBe('rules.employer.foundingDiscountPct');
    expect(failAt(edit((c) => { c.rules.host.graceDays = 45; }))).toBe('rules.host.graceDays');
    expect(failAt(edit((c) => { c.rules.host.foundingLockMonths = 0; }))).toBe('rules.host.foundingLockMonths');
    expect(failAt(edit((c) => { c.rules.certificatePricePaise = 49_950; }))).toBe('rules.certificatePricePaise');
    expect(failAt(edit((c) => { c.rules.ticketFeePct = 45; }))).toBe('rules.ticketFeePct');
    expect(failAt(edit((c) => { c.rules.ticketFeePct = 7.25; }))).toBe('rules.ticketFeePct');
    expect(failAt(edit((c) => { c.rules.ticketFeePct = 7.5; }))).toBe('ok');
    expect(failAt(edit((c) => { c.rules.ticketFeePct = null; }))).toBe('ok');
  });

  it('are listed in plain words when they change', () => {
    const after = edit((c) => { c.rules.employer.trialDays = 30; c.rules.employer.trialPlan = 'GROWTH'; c.rules.host.foundingDiscountPct = 20; c.rules.ticketFeePct = 7.5; c.rules.certificatePricePaise = 79_900; });
    expect(catalogChanges(BUILT_IN_CATALOG, after)).toEqual([
      { path: 'rules.employer.trialDays', label: 'Hiring trial: length', from: '14 days', to: '30 days' },
      { path: 'rules.employer.trialPlan', label: 'Hiring trial: plan', from: 'Pro', to: 'Growth' },
      { path: 'rules.host.foundingDiscountPct', label: 'Host founding price: discount', from: '30%', to: '20%' },
      { path: 'rules.certificatePricePaise', label: 'Event certificates: price', from: '₹499', to: '₹799' },
      { path: 'rules.ticketFeePct', label: 'Ticket platform fee', from: 'Server setting', to: '7.5%' },
    ]);
  });
});

describe('plan perks', () => {
  it('can be switched per plan, and the product reads the switch', () => {
    applyCatalog(edit((c) => { c.employer.GROWTH.featured = true; c.employer.PRO.newsletter = true; c.host.FREE.featuredEvents = true; }));
    expect(PLANS.GROWTH.featured).toBe(true);
    expect(PLANS.PRO.newsletter).toBe(true);
    expect(HOST_PLANS.FREE.featuredEvents).toBe(true);
    applyCatalog(null);
    expect(PLANS.GROWTH.featured).toBe(false);
  });

  it('never leave a higher plan without a perk the plan below it has', () => {
    expect(failAt(edit((c) => { c.employer.PRO.customBranding = false; }))).toBe('employer.PRO.customBranding');
    expect(failAt(edit((c) => { c.employer.SCALE.featured = false; }))).toBe('employer.SCALE.featured');
    expect(failAt(edit((c) => { c.host.FREE.removeBranding = true; c.host.PRO.removeBranding = false; }))).toBe('host.PRO.removeBranding');
    expect(failAt(edit((c) => { c.employer.GROWTH.customBranding = false; }))).toBe('ok'); // taking a perk away from a lower plan is fine
  });

  it('are named in the change list', () => {
    const after = edit((c) => { c.employer.GROWTH.featured = true; });
    expect(catalogChanges(BUILT_IN_CATALOG, after)).toEqual([{ path: 'employer.GROWTH.featured', label: 'Hiring Growth: featured badge and placement', from: 'Not included', to: 'Included' }]);
  });
});

describe('a version saved before perks and rules could be edited', () => {
  it('stays valid, keeping the built-in perks and rules', () => {
    const old = JSON.parse(JSON.stringify(BUILT_IN_CATALOG));
    delete old.rules;
    for (const k of Object.keys(old.employer)) { delete old.employer[k].featured; delete old.employer[k].newsletter; delete old.employer[k].customBranding; }
    for (const k of Object.keys(old.host)) { delete old.host[k].featuredEvents; delete old.host[k].removeBranding; }
    old.employer.PRO.pricePaise = 599_900; old.employer.PRO.annualPricePaise = 5_999_000;
    const r = validateCatalog(old);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rules).toEqual(BUILT_IN_CATALOG.rules);
      expect(r.data.employer.PRO).toMatchObject({ pricePaise: 599_900, featured: true, customBranding: true });
    }
  });
});


import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const tx = {
    // Typed loosely on purpose: the tests read back the arguments each call received.
    $executeRaw: vi.fn(async (..._a: any[]) => 1),
    planOfferRedemption: { create: vi.fn(async (_a: any) => ({})) },
    jobBoardEmployer: { update: vi.fn(async (_a: any) => ({})) },
    jobBoardListing: { updateMany: vi.fn(async (_a: any) => ({ count: 0 })) },
    eventOrganizer: { update: vi.fn(async (_a: any) => ({})) },
    event: { findMany: vi.fn(async (_a: any): Promise<any[]> => []), update: vi.fn(async (_a: any) => ({})) },
  };
  return {
    tx,
    prisma: {
      jobBoardEmployer: { findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      planOffer: { findMany: vi.fn(async (_a: any): Promise<any[]> => []), findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      planOfferRedemption: { findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      eventOrganizer: { findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      founderUser: { findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      startup: { findFirst: vi.fn(async (_a: any): Promise<any> => null) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock('@udyaibase/database', () => ({ prisma: db.prisma }));
vi.mock('@/lib/employer/notify', () => ({ notifyEmployer: vi.fn(async () => {}) }));
vi.mock('@/lib/employer/team', () => ({ ownerInboxes: vi.fn(async () => ['owner@acme.ai']) }));
vi.mock('@/lib/organizer-notify', () => ({ notifyOrganizer: vi.fn(async () => {}) }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/jobs/apply-emails', () => ({ button: () => '', esc: (s: string) => s, shell: (s: string) => s }));

import { claimAutoOffers, claimHostAutoOffers, onStartupVerified, redeemOfferCode } from '@/lib/offers/claim';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { OFFER_TEMPLATES, audiencesFor, benefitLength, benefitPhrase, companyKeyOf, normalizeOfferCode, offerState, placesLeft, suggestOfferCode, validateOfferInput } from '@udyaibase/utils/offers';

const now = new Date('2026-12-05T06:00:00Z');
const DAY = 864e5;
const offer = (over: Record<string, unknown> = {}) => ({
  id: 'o1', name: 'Launch', headline: 'Pro free for 3 months for the first 100 startups', portal: 'EMPLOYER', benefit: 'FREE_PLAN', plan: 'PRO', benefitDays: 90,
  audience: 'NEW_WORKSPACES', trigger: 'AUTO', code: null, startsAt: new Date('2026-12-01T00:00:00Z'), endsAt: new Date('2027-01-31T00:00:00Z'),
  maxRedemptions: 100, redeemedCount: 37, status: 'ACTIVE', showPublicly: true, createdAt: new Date('2026-11-30T00:00:00Z'), ...over,
});
const employer = (over: Record<string, unknown> = {}) => ({
  id: 'e1', email: 'owner@acme.ai', companyName: 'Acme AI', plan: 'FREE', planExpiresAt: null, planIsTrial: false, trialStartedAt: null,
  startupId: 's1', verifiedCompanyDomain: null, startupClaimMethod: null, createdAt: new Date(now.getTime() - 60_000), passwordHash: 'x', ...over,
});

describe('offer rules', () => {
  it('says where an offer stands', () => {
    expect(offerState(offer({ status: 'DRAFT' }), now)).toBe('draft');
    expect(offerState(offer(), now)).toBe('running');
    expect(offerState(offer({ startsAt: new Date('2026-12-10T00:00:00Z') }), now)).toBe('scheduled');
    expect(offerState(offer({ status: 'PAUSED' }), now)).toBe('paused');
    expect(offerState(offer({ redeemedCount: 100 }), now)).toBe('full');
    expect(offerState(offer({ endsAt: new Date('2026-12-02T00:00:00Z') }), now)).toBe('finished');
    expect(offerState(offer({ status: 'ENDED' }), now)).toBe('ended');
  });

  it('counts places left, and none when there is no limit', () => {
    expect(placesLeft(offer())).toBe(63);
    expect(placesLeft(offer({ maxRedemptions: null }))).toBeNull();
    expect(placesLeft(offer({ redeemedCount: 120 }))).toBe(0);
  });

  it('describes the benefit the way people say it', () => {
    expect(benefitLength(90)).toBe('3 months');
    expect(benefitLength(30)).toBe('1 month');
    expect(benefitLength(365)).toBe('1 year');
    expect(benefitLength(45)).toBe('45 days');
    expect(benefitPhrase({ plan: 'PRO', benefitDays: 90 })).toBe('Pro free for 3 months');
  });

  it('identifies the company by its startup, else its verified domain', () => {
    expect(companyKeyOf({ startupId: 's1', verifiedCompanyDomain: 'acme.ai' })).toBe('startup:s1');
    expect(companyKeyOf({ verifiedCompanyDomain: 'Acme.AI' })).toBe('domain:acme.ai');
    expect(companyKeyOf({})).toBeNull();
  });

  it('validates what the admin types', () => {
    const good = { name: 'Launch offer', headline: 'Pro free for 3 months', portal: 'EMPLOYER', plan: 'PRO', benefitDays: 90, audience: 'NEW_WORKSPACES', startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-31T00:00:00Z', maxRedemptions: 100 };
    expect(validateOfferInput(good).ok).toBe(true);
    const fails: [Record<string, unknown>, string][] = [
      [{ plan: 'FREE' }, 'plan'], [{ benefitDays: 0 }, 'benefitDays'], [{ benefitDays: 999 }, 'benefitDays'], [{ endsAt: '2026-11-01T00:00:00Z' }, 'endsAt'],
      [{ maxRedemptions: 0 }, 'maxRedemptions'], [{ audience: 'EVERYONE' }, 'audience'], [{ name: 'x' }, 'name'], [{ portal: 'READER' }, 'portal'], [{ portal: 'HOST' }, 'audience'], [{ audience: 'NEW_HOSTS' }, 'audience'], [{ trigger: 'CODE', audience: 'ANY_ACCOUNT' }, 'code'], [{ trigger: 'CODE', audience: 'ANY_ACCOUNT', code: 'ab' }, 'code'],
    ];
    for (const [over, field] of fails) {
      const r = validateOfferInput({ ...good, ...over });
      expect(r.ok, field).toBe(false);
      if (!r.ok) expect(r.field).toBe(field);
    }
    const open = validateOfferInput({ ...good, maxRedemptions: '' });
    expect(open.ok && open.data.maxRedemptions).toBeNull();
  });

  it('accepts a host offer and a code offer, and never advertises a code offer', () => {
    const base = { name: 'Host offer', headline: 'Pro free for 3 months', benefitDays: 90, startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-31T00:00:00Z' };
    const host = validateOfferInput({ ...base, portal: 'HOST', plan: 'PRO', audience: 'VERIFIED_FOUNDERS' });
    expect(host.ok && host.data).toMatchObject({ portal: 'HOST', trigger: 'AUTO', code: null });
    expect(validateOfferInput({ ...base, portal: 'HOST', plan: 'GROWTH', audience: 'NEW_HOSTS' }).ok).toBe(false);
    const code = validateOfferInput({ ...base, portal: 'EMPLOYER', plan: 'PRO', trigger: 'CODE', audience: 'ANY_ACCOUNT', code: ' launch-100 ', showPublicly: true });
    expect(code.ok && code.data).toMatchObject({ trigger: 'CODE', code: 'LAUNCH100', showPublicly: false });
  });

  it('offers the right audiences for each portal and way of claiming', () => {
    expect(audiencesFor('EMPLOYER', 'AUTO')).toEqual(['VERIFIED_STARTUPS', 'NEW_WORKSPACES']);
    expect(audiencesFor('HOST', 'AUTO')).toEqual(['VERIFIED_FOUNDERS', 'NEW_HOSTS']);
    expect(audiencesFor('HOST', 'CODE')).toEqual(['ANY_ACCOUNT', 'VERIFIED_FOUNDERS']);
  });

  it('reads a typed code the same however it is written, and suggests codes without look-alike characters', () => {
    expect(normalizeOfferCode(' launch-100 ')).toBe('LAUNCH100');
    expect(normalizeOfferCode(undefined)).toBe('');
    const made = suggestOfferCode('hire', () => 0.5);
    expect(made).toMatch(/^HIRE[A-HJ-NP-Z2-9]{6}$/);
  });

  it('ships ready-made offers that are all valid as they stand', () => {
    expect(OFFER_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const tpl of OFFER_TEMPLATES) {
      const r = validateOfferInput({ ...tpl, code: tpl.trigger === 'CODE' ? suggestOfferCode(tpl.codePrefix) : null, startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-31T00:00:00Z' });
      expect(r.ok, tpl.key).toBe(true);
    }
    expect(new Set(OFFER_TEMPLATES.map((x) => x.portal))).toEqual(new Set(['EMPLOYER', 'HOST']));
  });
});

describe('granting an offer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.tx.$executeRaw.mockResolvedValue(1);
    db.tx.planOfferRedemption.create.mockResolvedValue({});
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer());
    db.prisma.planOffer.findMany.mockResolvedValue([offer()]);
    db.prisma.$transaction.mockImplementation(async (fn: (t: typeof db.tx) => unknown) => fn(db.tx));
    db.prisma.planOffer.findUnique.mockResolvedValue(null);
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue(null);
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(null);
    db.prisma.founderUser.findUnique.mockResolvedValue(null);
    db.prisma.startup.findFirst.mockResolvedValue(null);
    db.tx.event.findMany.mockResolvedValue([]);
  });

  it('switches a new workspace to the offered plan for the offered days and tells the owner', async () => {
    const got = await claimAutoOffers('e1', ['NEW_WORKSPACES'], now);
    expect(got).toMatchObject({ offerId: 'o1', plan: 'PRO' });
    expect(got!.endsAt.getTime()).toBe(now.getTime() + 90 * DAY);
    const data = db.tx.jobBoardEmployer.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ plan: 'PRO', planIsTrial: false, maxActiveJobs: 15, trialStartedAt: now });
    expect(db.tx.planOfferRedemption.create.mock.calls[0][0].data).toMatchObject({ offerId: 'o1', accountId: 'e1', companyKey: 'startup:s1', benefitDays: 90 });
    expect(sendEmailFireAndForget).toHaveBeenCalledTimes(1);
  });

  it('grants nothing once the offer is full: the locked count update decides, not the earlier read', async () => {
    db.tx.$executeRaw.mockResolvedValue(0);
    expect(await claimAutoOffers('e1', ['NEW_WORKSPACES'], now)).toBeNull();
    expect(db.tx.planOfferRedemption.create).not.toHaveBeenCalled();
    expect(db.tx.jobBoardEmployer.update).not.toHaveBeenCalled();
    expect(sendEmailFireAndForget).not.toHaveBeenCalled();
  });

  it('does not grant twice to the same company, and moves on to the next offer', async () => {
    db.prisma.planOffer.findMany.mockResolvedValue([offer(), offer({ id: 'o2', headline: 'Growth free for a month', plan: 'GROWTH', benefitDays: 30 })]);
    db.tx.planOfferRedemption.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    db.prisma.$transaction.mockImplementation(async (fn: (t: typeof db.tx) => unknown) => fn(db.tx));
    const got = await claimAutoOffers('e1', ['NEW_WORKSPACES'], now);
    expect(got).toMatchObject({ offerId: 'o2', plan: 'GROWTH' });
  });

  it('never touches an account that is already paying', async () => {
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ plan: 'GROWTH', planExpiresAt: new Date(now.getTime() + 10 * DAY) }));
    expect(await claimAutoOffers('e1', ['NEW_WORKSPACES'], now)).toBeNull();
    expect(db.prisma.planOffer.findMany).not.toHaveBeenCalled();
  });

  it('replaces a running trial, and keeps a trial end that is later than the offer would give', async () => {
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ plan: 'PRO', planIsTrial: true, planExpiresAt: new Date(now.getTime() + 5 * DAY), trialStartedAt: new Date(now.getTime() - 9 * DAY) }));
    const got = await claimAutoOffers('e1', ['NEW_WORKSPACES'], now);
    expect(got!.endsAt.getTime()).toBe(now.getTime() + 90 * DAY);
    expect(db.tx.jobBoardEmployer.update.mock.calls[0][0].data).not.toHaveProperty('trialStartedAt');
  });

  it('treats a workspace as new only for a few minutes after it was created', async () => {
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ createdAt: new Date(now.getTime() - 3 * DAY) }));
    expect(await claimAutoOffers('e1', ['NEW_WORKSPACES'], now)).toBeNull();
  });

  it('grants a verified-startup offer to a founder-verified workspace, but not a new-workspace offer to an old one', async () => {
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ createdAt: new Date(now.getTime() - 3 * DAY), startupClaimMethod: 'FOUNDER' }));
    db.prisma.planOffer.findMany.mockResolvedValue([offer({ audience: 'VERIFIED_STARTUPS' })]);
    expect(await claimAutoOffers('e1', ['VERIFIED_STARTUPS', 'NEW_WORKSPACES'], now)).not.toBeNull();
    // The same old workspace is not "new": a new-workspace offer alone grants nothing.
    db.prisma.planOffer.findMany.mockResolvedValue([offer({ audience: 'NEW_WORKSPACES' })]);
    expect(await claimAutoOffers('e1', ['VERIFIED_STARTUPS', 'NEW_WORKSPACES'], now)).toBeNull();
  });

  it('skips Udyaibase’s own workspaces', async () => {
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ email: 'jobs@udyaibase.com' }));
    expect(await claimAutoOffers('e1', ['NEW_WORKSPACES'], now)).toBeNull();
  });

  it('never breaks sign-up: without the offers tables it grants nothing and does not throw', async () => {
    db.prisma.planOffer.findMany.mockRejectedValue(Object.assign(new Error('The table `public.PlanOffer` does not exist'), { code: 'P2021' }));
    await expect(claimAutoOffers('e1', ['NEW_WORKSPACES'], now)).resolves.toBeNull();
  });
});

const host = (over: Record<string, unknown> = {}) => ({
  id: 'h1', email: 'asha@acme.ai', name: 'Asha', company: null, plan: 'FREE', planExpiresAt: null, emailVerified: true,
  createdAt: new Date('2026-12-04T00:00:00Z'), companyDomain: null, companyEmailVerified: false, ...over,
});

describe('granting an offer to an event host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.tx.$executeRaw.mockResolvedValue(1);
    db.tx.planOfferRedemption.create.mockResolvedValue({});
    db.tx.event.findMany.mockResolvedValue([]);
    db.prisma.$transaction.mockImplementation(async (fn: (t: typeof db.tx) => unknown) => fn(db.tx));
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(host());
    db.prisma.founderUser.findUnique.mockResolvedValue(null);
    db.prisma.startup.findFirst.mockResolvedValue(null);
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue(null);
    db.prisma.planOffer.findMany.mockResolvedValue([offer({ portal: 'HOST', audience: 'NEW_HOSTS' })]);
  });

  it('gives a new, email-confirmed host Pro and features their upcoming events', async () => {
    const ends = new Date(now.getTime() + 20 * DAY);
    db.tx.event.findMany.mockResolvedValue([{ id: 'ev1', endAt: ends, featuredUntil: null }]);
    const got = await claimHostAutoOffers('h1', ['NEW_HOSTS', 'VERIFIED_FOUNDERS'], now);
    expect(got).toMatchObject({ plan: 'PRO' });
    expect(db.tx.eventOrganizer.update.mock.calls[0][0].data).toMatchObject({ plan: 'PRO', planCycle: 'MONTHLY' });
    expect(db.tx.event.update.mock.calls[0][0]).toMatchObject({ where: { id: 'ev1' }, data: { featuredUntil: ends } });
    expect(db.tx.planOfferRedemption.create.mock.calls[0][0].data).toMatchObject({ portal: 'HOST', accountId: 'h1', companyKey: null });
  });

  it('gives nothing to a host whose email is not confirmed, or who signed up before the offer began', async () => {
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(host({ emailVerified: false }));
    expect(await claimHostAutoOffers('h1', ['NEW_HOSTS'], now)).toBeNull();
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(host({ createdAt: new Date('2026-10-01T00:00:00Z') }));
    expect(await claimHostAutoOffers('h1', ['NEW_HOSTS'], now)).toBeNull();
  });

  it('treats a host as a verified founder only when their email owns a verified startup', async () => {
    db.prisma.planOffer.findMany.mockResolvedValue([offer({ portal: 'HOST', audience: 'VERIFIED_FOUNDERS' })]);
    expect(await claimHostAutoOffers('h1', ['VERIFIED_FOUNDERS'], now)).toBeNull();
    db.prisma.founderUser.findUnique.mockResolvedValue({ id: 'f1' });
    db.prisma.startup.findFirst.mockResolvedValue({ id: 's9' });
    expect(await claimHostAutoOffers('h1', ['VERIFIED_FOUNDERS'], now)).not.toBeNull();
    expect(db.tx.planOfferRedemption.create.mock.calls[0][0].data.companyKey).toBe('startup:s9');
  });

  it('never touches a host who already pays for Pro, or Udyaibase’s own host accounts', async () => {
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(host({ plan: 'PRO', planExpiresAt: new Date(now.getTime() + 5 * DAY) }));
    expect(await claimHostAutoOffers('h1', ['NEW_HOSTS'], now)).toBeNull();
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(host({ email: 'events@udyaibase.com' }));
    expect(await claimHostAutoOffers('h1', ['NEW_HOSTS'], now)).toBeNull();
  });
});

describe('a founder verifies their startup', () => {
  it('grants the verified-founder offers on the hiring workspace and on the founder’s host account', async () => {
    vi.clearAllMocks();
    db.tx.$executeRaw.mockResolvedValue(1);
    db.tx.event.findMany.mockResolvedValue([]);
    db.prisma.$transaction.mockImplementation(async (fn: (t: typeof db.tx) => unknown) => fn(db.tx));
    (db.prisma.jobBoardEmployer as any).findFirst = vi.fn(async () => ({ id: 'e1' }));
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ createdAt: new Date(now.getTime() - 9 * DAY), startupClaimMethod: 'FOUNDER' }));
    db.prisma.founderUser.findUnique.mockImplementation(async (a: any) => (a.where.id ? { email: 'Asha@Acme.ai' } : { id: 'f1' }));
    db.prisma.eventOrganizer.findUnique.mockImplementation(async (a: any) => (a.where.email ? { id: 'h1' } : host()));
    db.prisma.startup.findFirst.mockResolvedValue({ id: 's1' });
    db.prisma.planOffer.findMany.mockImplementation(async (a: any) => [offer({ portal: a.where.portal, audience: a.where.portal === 'HOST' ? 'VERIFIED_FOUNDERS' : 'VERIFIED_STARTUPS' })]);
    await onStartupVerified('s1', 'f1', now);
    expect(db.tx.jobBoardEmployer.update).toHaveBeenCalledTimes(1);
    expect(db.tx.eventOrganizer.update).toHaveBeenCalledTimes(1);
    expect(db.prisma.eventOrganizer.findUnique.mock.calls[0][0].where).toEqual({ email: 'asha@acme.ai' });
  });

  it('does nothing, quietly, when the founder has neither a workspace nor a host account', async () => {
    vi.clearAllMocks();
    (db.prisma.jobBoardEmployer as any).findFirst = vi.fn(async () => null);
    db.prisma.founderUser.findUnique.mockResolvedValue({ email: 'solo@acme.ai' });
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(null);
    await expect(onStartupVerified('s1', 'f1', now)).resolves.toBeUndefined();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('redeeming a promo code', () => {
  const codeOffer = (over: Record<string, unknown> = {}) => offer({ trigger: 'CODE', code: 'HIREAB12CD', audience: 'ANY_ACCOUNT', ...over });
  beforeEach(() => {
    vi.clearAllMocks();
    db.tx.$executeRaw.mockResolvedValue(1);
    db.tx.planOfferRedemption.create.mockResolvedValue({});
    db.prisma.$transaction.mockImplementation(async (fn: (t: typeof db.tx) => unknown) => fn(db.tx));
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ createdAt: new Date(now.getTime() - 40 * DAY) }));
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue(null);
    db.prisma.planOffer.findUnique.mockResolvedValue(codeOffer());
  });

  it('applies a valid code, however it is typed', async () => {
    const r = await redeemOfferCode('EMPLOYER', 'e1', ' hire-ab12cd ', now);
    expect(r).toMatchObject({ ok: true, plan: 'Pro' });
    expect(db.prisma.planOffer.findUnique.mock.calls[0][0].where).toEqual({ code: 'HIREAB12CD' });
    expect(db.tx.jobBoardEmployer.update).toHaveBeenCalledTimes(1);
  });

  it('gives one answer for every kind of unknown code: wrong, other portal, draft, or an automatic offer', async () => {
    const same = async (o: unknown, portal: 'EMPLOYER' | 'HOST' = 'EMPLOYER') => { db.prisma.planOffer.findUnique.mockResolvedValue(o); return redeemOfferCode(portal, 'e1', 'HIREAB12CD', now); };
    const answers = [await same(null), await same(codeOffer({ portal: 'HOST' })), await same(codeOffer({ status: 'DRAFT' })), await same(codeOffer({ trigger: 'AUTO' })), await redeemOfferCode('EMPLOYER', 'e1', '!!', now)];
    expect(new Set(answers.map((a) => (a.ok ? 'ok' : a.error))).size).toBe(1);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('says why a real code can’t be used: not started, full, over, already used, already paying', async () => {
    const say = async (o: unknown) => { db.prisma.planOffer.findUnique.mockResolvedValue(o); const r = await redeemOfferCode('EMPLOYER', 'e1', 'HIREAB12CD', now); return r.ok ? 'ok' : r.error; };
    expect(await say(codeOffer({ startsAt: new Date('2026-12-20T00:00:00Z') }))).toMatch(/isn’t active yet/);
    expect(await say(codeOffer({ redeemedCount: 100 }))).toMatch(/fully claimed/);
    expect(await say(codeOffer({ status: 'ENDED' }))).toMatch(/no longer active/);
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue({ id: 'r1' });
    expect(await say(codeOffer())).toMatch(/already used/);
    // Their own code, now full: they still hear "already used", not "fully claimed".
    expect(await say(codeOffer({ redeemedCount: 100 }))).toMatch(/already used/);
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue(null);
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ plan: 'GROWTH', planExpiresAt: new Date(now.getTime() + 9 * DAY) }));
    expect(await say(codeOffer())).toMatch(/already have one/);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('holds a verified-only code back until the startup is verified, and says how to qualify', async () => {
    db.prisma.planOffer.findUnique.mockResolvedValue(codeOffer({ audience: 'VERIFIED_STARTUPS' }));
    const r = await redeemOfferCode('EMPLOYER', 'e1', 'HIREAB12CD', now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Verify your startup/);
  });

  it('loses the race for the last place cleanly', async () => {
    db.tx.$executeRaw.mockResolvedValue(0);
    const r = await redeemOfferCode('EMPLOYER', 'e1', 'HIREAB12CD', now);
    expect(r).toEqual({ ok: false, error: 'This code has just been fully claimed.' });
  });

  it('refuses a second workspace of the same company', async () => {
    db.tx.planOfferRedemption.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    const r = await redeemOfferCode('EMPLOYER', 'e1', 'HIREAB12CD', now);
    expect(r).toEqual({ ok: false, error: 'Your company has already used this code.' });
  });

  it('works for a host account too', async () => {
    db.prisma.eventOrganizer.findUnique.mockResolvedValue(host());
    db.tx.event.findMany.mockResolvedValue([]);
    db.prisma.planOffer.findUnique.mockResolvedValue(codeOffer({ portal: 'HOST', code: 'HOSTAB12CD' }));
    const r = await redeemOfferCode('HOST', 'h1', 'HOSTAB12CD', now);
    expect(r).toMatchObject({ ok: true, plan: 'Pro' });
    expect(db.tx.eventOrganizer.update).toHaveBeenCalledTimes(1);
  });
});

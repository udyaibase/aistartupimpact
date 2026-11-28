import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(async (..._a: any[]) => 1),
    planOfferRedemption: { findUnique: vi.fn(async (_a: any): Promise<any> => null), create: vi.fn(async (_a: any) => ({})), update: vi.fn(async (_a: any) => ({})), updateMany: vi.fn(async (_a: any) => ({ count: 1 })) },
  };
  return {
    tx,
    prisma: {
      jobBoardEmployer: { findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      eventOrganizer: { findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      founderUser: { findUnique: vi.fn(async (_a: any): Promise<any> => null) },
      startup: { findFirst: vi.fn(async (_a: any): Promise<any> => null) },
      planOffer: { findUnique: vi.fn(async (_a: any): Promise<any> => null), findMany: vi.fn(async (_a: any): Promise<any[]> => []) },
      planOfferRedemption: { findUnique: vi.fn(async (_a: any): Promise<any> => null), findMany: vi.fn(async (_a: any): Promise<any[]> => []), findFirst: vi.fn(async (_a: any): Promise<any> => null), updateMany: vi.fn(async (_a: any) => ({ count: 1 })), update: vi.fn(async (_a: any) => ({})) },
      $executeRaw: vi.fn(async (..._a: any[]) => 1),
      $transaction: vi.fn(async (arg: any): Promise<any> => (typeof arg === 'function' ? arg(tx) : Promise.all(arg))),
    },
  };
});
vi.mock('@udyaibase/database', () => ({ prisma: db.prisma }));
vi.mock('@/lib/employer/notify', () => ({ notifyEmployer: vi.fn(async () => {}) }));
vi.mock('@/lib/employer/team', () => ({ ownerInboxes: vi.fn(async () => []) }));
vi.mock('@/lib/organizer-notify', () => ({ notifyOrganizer: vi.fn(async () => {}) }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/jobs/apply-emails', () => ({ button: () => '', esc: (s: string) => s, shell: (s: string) => s }));

import { confirmDiscount, discountNote, holdDiscount, quoteDiscount, redeemAnyCode } from '@/lib/offers/discount';
import { OFFER_TEMPLATES, applyDiscount, benefitPhrase, validateOfferInput } from '@udyaibase/utils/offers';

const now = new Date('2026-12-05T06:00:00Z');
const DAY = 864e5;
const offer = (over: Record<string, unknown> = {}) => ({
  id: 'd1', name: 'Save 25', headline: '25% off your first payment', portal: 'EMPLOYER', benefit: 'PERCENT_OFF', plan: 'ANY', benefitDays: 0, percentOff: 25, amountOffPaise: null, cycle: 'ANY',
  audience: 'ANY_ACCOUNT', trigger: 'CODE', code: 'SAVEAB12CD', startsAt: new Date('2026-12-01T00:00:00Z'), endsAt: new Date('2027-01-31T00:00:00Z'),
  maxRedemptions: 200, redeemedCount: 10, status: 'ACTIVE', showPublicly: false, createdAt: new Date('2026-11-30T00:00:00Z'), ...over,
});
const employer = (over: Record<string, unknown> = {}) => ({
  id: 'e1', email: 'owner@acme.ai', companyName: 'Acme AI', plan: 'FREE', planExpiresAt: null, planIsTrial: false, trialStartedAt: null,
  startupId: 's1', verifiedCompanyDomain: null, startupClaimMethod: null, createdAt: new Date(now.getTime() - 40 * DAY), passwordHash: 'x', ...over,
});
const PRO_MONTH = { plan: 'PRO', cycle: 'MONTHLY', amountPaise: 499_900 };

describe('discount maths', () => {
  const pct = (percentOff: number, over: Record<string, unknown> = {}) => ({ benefit: 'PERCENT_OFF', plan: 'ANY', cycle: 'ANY', percentOff, amountOffPaise: null, ...over });
  const amt = (rupees: number, over: Record<string, unknown> = {}) => ({ benefit: 'AMOUNT_OFF', plan: 'ANY', cycle: 'ANY', percentOff: null, amountOffPaise: rupees * 100, ...over });

  it('takes a percentage off the price before GST, in whole rupees', () => {
    expect(applyDiscount(pct(25), PRO_MONTH)).toEqual({ discountPaise: 125_000, finalPaise: 374_900 });
    expect(applyDiscount(pct(33), { plan: 'GROWTH', cycle: 'MONTHLY', amountPaise: 249_900 })!.discountPaise % 100).toBe(0);
  });

  it('takes a fixed amount off, and never the whole price', () => {
    expect(applyDiscount(amt(500), PRO_MONTH)).toEqual({ discountPaise: 50_000, finalPaise: 449_900 });
    expect(applyDiscount(amt(9999), PRO_MONTH)).toEqual({ discountPaise: 499_800, finalPaise: 100 });
  });

  it('only works on the plan and billing cycle it is for', () => {
    expect(applyDiscount(pct(25, { plan: 'SCALE' }), PRO_MONTH)).toBeNull();
    expect(applyDiscount(pct(25, { plan: 'PRO' }), PRO_MONTH)).not.toBeNull();
    expect(applyDiscount(pct(25, { cycle: 'ANNUAL' }), PRO_MONTH)).toBeNull();
    expect(applyDiscount(pct(25, { cycle: 'ANNUAL' }), { ...PRO_MONTH, cycle: 'ANNUAL', amountPaise: 4_999_000 })).not.toBeNull();
  });

  it('is not a discount at all for a free-plan offer', () => {
    expect(applyDiscount({ benefit: 'FREE_PLAN', plan: 'PRO', cycle: 'ANY', percentOff: null, amountOffPaise: null }, PRO_MONTH)).toBeNull();
  });

  it('describes a discount in one phrase', () => {
    expect(benefitPhrase({ benefit: 'PERCENT_OFF', percentOff: 25, plan: 'ANY', benefitDays: 0, portal: 'EMPLOYER', cycle: 'ANY' })).toBe('25% off any plan');
    expect(benefitPhrase({ benefit: 'PERCENT_OFF', percentOff: 20, plan: 'PRO', benefitDays: 0, portal: 'HOST', cycle: 'ANNUAL' })).toBe('20% off Pro, yearly');
    expect(benefitPhrase({ benefit: 'AMOUNT_OFF', amountOffPaise: 50_000, plan: 'GROWTH', benefitDays: 0, portal: 'EMPLOYER', cycle: 'ANY' })).toBe('₹500 off Growth');
  });
});

describe('validating a discount offer', () => {
  const base = { name: 'Save 25', headline: '25% off your first payment', portal: 'EMPLOYER', plan: 'ANY', audience: 'ANY_ACCOUNT', code: 'SAVE25NOW', startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-31T00:00:00Z' };
  it('is always a code, with no free period', () => {
    const r = validateOfferInput({ ...base, benefit: 'PERCENT_OFF', percentOff: 25, trigger: 'AUTO', benefitDays: 90 });
    expect(r.ok && r.data).toMatchObject({ benefit: 'PERCENT_OFF', trigger: 'CODE', percentOff: 25, benefitDays: 0, amountOffPaise: null, cycle: 'ANY', showPublicly: false });
  });
  it('refuses a discount of the whole price, by percentage or by amount', () => {
    const p = validateOfferInput({ ...base, benefit: 'PERCENT_OFF', percentOff: 100 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.field).toBe('percentOff');
    const a = validateOfferInput({ ...base, benefit: 'AMOUNT_OFF', plan: 'GROWTH', cycle: 'MONTHLY', amountOffPaise: 249_900 });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.field).toBe('amountOffPaise');
    expect(validateOfferInput({ ...base, benefit: 'AMOUNT_OFF', plan: 'GROWTH', cycle: 'MONTHLY', amountOffPaise: 50_000 }).ok).toBe(true);
  });
  it('needs whole rupees and a known billing cycle', () => {
    expect(validateOfferInput({ ...base, benefit: 'AMOUNT_OFF', amountOffPaise: 12_345 }).ok).toBe(false);
    expect(validateOfferInput({ ...base, benefit: 'PERCENT_OFF', percentOff: 10, cycle: 'WEEKLY' }).ok).toBe(false);
  });
  it('ships discount templates that are valid as they stand', () => {
    const discounts = OFFER_TEMPLATES.filter((t) => t.benefit);
    expect(discounts.length).toBeGreaterThanOrEqual(2);
    for (const t of discounts) expect(validateOfferInput({ ...t, code: 'SAVE25NOW', startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-31T00:00:00Z' }).ok, t.key).toBe(true);
  });
});

describe('a discount code at checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.planOffer.findUnique.mockResolvedValue(offer());
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer());
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue(null);
    db.prisma.planOfferRedemption.findMany.mockResolvedValue([]);
    db.prisma.planOfferRedemption.updateMany.mockResolvedValue({ count: 1 });
    db.tx.$executeRaw.mockResolvedValue(1);
    db.tx.planOfferRedemption.findUnique.mockResolvedValue(null);
    db.prisma.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(db.tx) : Promise.all(arg)));
  });

  it('hands a discount code back to the billing page without using it up', async () => {
    const r = await redeemAnyCode('EMPLOYER', 'e1', 'save-ab12cd', now);
    expect(r).toMatchObject({ ok: true, kind: 'discount', code: 'SAVEAB12CD', label: '25% off any plan' });
    expect(db.tx.planOfferRedemption.create).not.toHaveBeenCalled();
  });

  it('quotes the reduced price, also for an account that already pays', async () => {
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(employer({ plan: 'GROWTH', planExpiresAt: new Date(now.getTime() + 9 * DAY) }));
    const q = await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
    expect(q).toMatchObject({ ok: true, discountPaise: 125_000, finalPaise: 374_900 });
  });

  it('says so when the code is for another plan or billing cycle', async () => {
    db.prisma.planOffer.findUnique.mockResolvedValue(offer({ plan: 'SCALE' }));
    const q = await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.error).toMatch(/doesn’t work on this plan/);
  });

  it('gives one answer for a wrong code, a free-plan code, another portal’s code and a draft', async () => {
    const answers: string[] = [];
    for (const o of [null, offer({ benefit: 'FREE_PLAN' }), offer({ portal: 'HOST' }), offer({ status: 'DRAFT' })]) {
      db.prisma.planOffer.findUnique.mockResolvedValue(o);
      const q = await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
      answers.push(q.ok ? 'ok' : q.error);
    }
    expect(new Set(answers).size).toBe(1);
  });

  it('holds a place when the order is created, and refuses when none is left', async () => {
    const q = await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
    if (!q.ok) throw new Error('quote failed');
    expect(await holdDiscount(q, PRO_MONTH, 'order_1', now)).toEqual({ ok: true });
    expect(db.tx.planOfferRedemption.create.mock.calls[0][0].data).toMatchObject({ status: 'PENDING', paymentRef: 'order_1', discountPaise: 125_000, accountId: 'e1', benefitDays: 0 });
    db.tx.$executeRaw.mockResolvedValue(0);
    expect(await holdDiscount(q, PRO_MONTH, 'order_2', now)).toEqual({ ok: false, error: 'This code has just been fully claimed.' });
  });

  it('lets the same account reopen checkout without taking a second place', async () => {
    const q = await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
    if (!q.ok) throw new Error('quote failed');
    db.tx.planOfferRedemption.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING' });
    expect(await holdDiscount(q, PRO_MONTH, 'order_3', now)).toEqual({ ok: true });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    expect(db.tx.planOfferRedemption.update.mock.calls[0][0]).toMatchObject({ where: { id: 'r1' }, data: { paymentRef: 'order_3' } });
  });

  it('refuses a code this account has already paid with, and one its company has used', async () => {
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    const used = await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
    expect(used).toEqual({ ok: false, error: 'You’ve already used this code.' });
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue(null);
    const q = await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
    if (!q.ok) throw new Error('quote failed');
    db.tx.planOfferRedemption.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    expect(await holdDiscount(q, PRO_MONTH, 'order_4', now)).toEqual({ ok: false, error: 'Your company has already used this code.' });
  });

  it('keeps a held place usable after the offer fills up, but turns newcomers away', async () => {
    db.prisma.planOffer.findUnique.mockResolvedValue(offer({ redeemedCount: 200 }));
    expect((await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now)).ok).toBe(false);
    db.prisma.planOfferRedemption.findUnique.mockResolvedValue({ status: 'PENDING' });
    expect((await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now)).ok).toBe(true);
  });

  it('gives back the place of a checkout that was never paid', async () => {
    db.prisma.planOfferRedemption.findMany.mockResolvedValue([{ id: 'old1' }]);
    db.tx.planOfferRedemption.updateMany.mockResolvedValue({ count: 1 });
    await quoteDiscount('EMPLOYER', 'e1', 'SAVEAB12CD', PRO_MONTH, now);
    expect(db.tx.planOfferRedemption.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'old1', status: 'PENDING' }, data: { status: 'RELEASED' } });
    expect(db.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('marks the code used when the payment succeeds, and still counts one paid after its hold ran out', async () => {
    await confirmDiscount('order_1');
    expect(db.prisma.planOfferRedemption.updateMany.mock.calls[0][0]).toMatchObject({ where: { paymentRef: 'order_1', status: 'PENDING' }, data: { status: 'ACTIVE' } });
    db.prisma.planOfferRedemption.updateMany.mockResolvedValue({ count: 0 });
    db.prisma.planOfferRedemption.findFirst.mockResolvedValue({ id: 'r9', offerId: 'd1' });
    await confirmDiscount('order_late');
    expect(db.prisma.planOfferRedemption.update.mock.calls[0][0]).toMatchObject({ where: { id: 'r9' }, data: { status: 'ACTIVE' } });
  });

  it('never fails a payment because of the code', async () => {
    db.prisma.planOfferRedemption.updateMany.mockRejectedValue(new Error('table missing'));
    await expect(confirmDiscount('order_x')).resolves.toBeUndefined();
  });

  it('writes the code and the list price for the invoice line, or nothing when no code was used', async () => {
    db.prisma.planOfferRedemption.findFirst.mockResolvedValue({ discountPaise: 125_000, offer: { code: 'SAVEAB12CD', benefit: 'PERCENT_OFF', percentOff: 25, amountOffPaise: null } });
    expect(await discountNote('order_1', 374_900)).toBe(' (code SAVEAB12CD: 25% off, list price Rs 4,999.00)');
    db.prisma.planOfferRedemption.findFirst.mockResolvedValue({ discountPaise: 50_000, offer: { code: 'FLAT500', benefit: 'AMOUNT_OFF', percentOff: null, amountOffPaise: 50_000 } });
    expect(await discountNote('order_2', 449_900)).toBe(' (code FLAT500: Rs 500 off, list price Rs 4,999.00)');
    db.prisma.planOfferRedemption.findFirst.mockResolvedValue(null);
    expect(await discountNote('order_3', 499_900)).toBe('');
  });
});

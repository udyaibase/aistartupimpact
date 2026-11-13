import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  fundingDataPurchase: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  newsletterSubscriber: { upsert: vi.fn() },
  $executeRaw: vi.fn(),
}));
const otp = vi.hoisted(() => ({ createOtp: vi.fn(), verifyOtp: vi.fn() }));
const rzp = vi.hoisted(() => ({ createRazorpayOrder: vi.fn(), razorpayKeys: vi.fn(() => ({ keyId: 'rzp_test', keySecret: 's' })), checkoutSignatureValid: vi.fn(() => true) }));
const mail = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ success: true })), sendEmailFireAndForget: vi.fn() }));
const invoice = vi.hoisted(() => ({ emailInvoice: vi.fn(async () => ({ ok: true })) }));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/db', () => ({ getAllFundingRoundsDirect: vi.fn(async () => []) }));
vi.mock('@/lib/otp', () => otp);
vi.mock('@/lib/email/send', () => mail);
vi.mock('@/lib/billing/razorpay', () => rzp);
vi.mock('@/lib/billing/invoice', () => invoice);
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimit: null, authRateLimit: null, strictRateLimit: null,
  checkRateLimit: async () => ({ success: true }), emailCodeAllowed: async () => true, getClientIdentifier: () => '1.2.3.4',
}));
vi.mock('@/lib/funding/dataset', async (orig) => {
  const real = await orig<typeof import('@/lib/funding/dataset')>();
  const s = (id: string) => ({ id, name: id, slug: id, sector: 'Fintech', city: 'Pune', stage: 'SEED', foundedYear: null, websiteUrl: null, linkedinUrl: null, founders: [], employeeCount: null, profileUrl: '', listedTotalInr: 0, rounds: [] });
  return { ...real, loadDataset: vi.fn(async () => Array.from({ length: 120 }, (_, i) => s(`s${i}`))) };
});

import { emailPass, purchaseToken } from '@/lib/funding/access';
import { POST as sendCode } from '@/app/api/funding-data/send-code/route';
import { POST as verifyCode } from '@/app/api/funding-data/verify-code/route';
import { POST as freeDownload } from '@/app/api/funding-report/download/route';
import { POST as checkout } from '@/app/api/funding-data/checkout/route';
import { GET as download } from '@/app/api/funding-data/download/route';
import { activateFundingPurchase } from '@/lib/funding/purchase';

const req = (url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeAll(() => { process.env.NEXTAUTH_SECRET ||= 'test-secret-for-funding-tokens'; });
beforeEach(() => {
  vi.clearAllMocks();
  rzp.razorpayKeys.mockReturnValue({ keyId: 'rzp_test', keySecret: 's' });
  rzp.createRazorpayOrder.mockResolvedValue({ orderId: 'order_1', keyId: 'rzp_test' });
});

describe('email code (free and paid)', () => {
  it('sends a code and returns a pass only for the right code', async () => {
    otp.createOtp.mockResolvedValue({ otp: '123456' });
    expect((await sendCode(req('/x', { email: 'Priya@Example.com' }))).status).toBe(200);
    expect(otp.createOtp).toHaveBeenCalledWith('priya@example.com', 'funding_data');

    otp.verifyOtp.mockResolvedValue({ valid: false, error: 'Incorrect code. 2 attempts remaining.' });
    const bad = await verifyCode(req('/x', { email: 'priya@example.com', code: '000000' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).pass).toBeUndefined();

    otp.verifyOtp.mockResolvedValue({ valid: true });
    const ok = await (await verifyCode(req('/x', { email: 'priya@example.com', code: '123456' }))).json();
    expect(typeof ok.pass).toBe('string');
  });
});

describe('free snapshot', () => {
  it('needs a verified email', async () => {
    const r = await freeDownload(req('/x', { email: 'anyone@example.com', consent: true }));
    expect(r.status).toBe(401);
    expect(db.newsletterSubscriber.upsert).not.toHaveBeenCalled();
  });

  it('needs the consent box, checked on the server', async () => {
    const r = await freeDownload(req('/x', { pass: emailPass('a@b.co'), consent: false }));
    expect(r.status).toBe(400);
    expect(db.newsletterSubscriber.upsert).not.toHaveBeenCalled();
  });

  it('subscribes the verified email as Active with the consent recorded, then gives the link', async () => {
    const r = await freeDownload(req('/x', { pass: emailPass('a@b.co'), consent: true }));
    expect(r.status).toBe(200);
    expect((await r.json()).data.downloadUrl).toMatch(/^\/api\/funding-report\/pdf\?t=/);
    const arg = db.newsletterSubscriber.upsert.mock.calls[0][0];
    expect(arg.where.email).toBe('a@b.co');
    expect(arg.create).toMatchObject({ isActive: true, emailVerified: true, source: 'funding_free', consentSource: 'funding_free' });
    expect(arg.create.consentText).toMatch(/newsletter/);
  });
});

describe('paid checkout', () => {
  const body = (o: Record<string, unknown> = {}) => ({
    pass: emailPass('buyer@example.com'), consent: true, pack: 'STARTER', filters: {},
    billing: { billingType: 'INDIVIDUAL', billingName: 'Priya Rao', billingState: '29' }, ...o,
  });

  it('refuses without a verified email or consent', async () => {
    expect((await checkout(req('/x', body({ pass: undefined })))).status).toBe(401);
    expect((await checkout(req('/x', body({ consent: false })))).status).toBe(400);
    expect(rzp.createRazorpayOrder).not.toHaveBeenCalled();
  });

  it('charges the server price for the pack, never one from the browser', async () => {
    const r = await checkout(req('/x', body({ amount: 100, totalPaise: 100 })));
    expect(r.status).toBe(200);
    expect(rzp.createRazorpayOrder.mock.calls[0][0]).toBe(19900);
    expect(rzp.createRazorpayOrder.mock.calls[0][2]).toMatchObject({ purpose: 'FUNDING_DATA', pack: 'STARTER' });
    expect(db.fundingDataPurchase.create.mock.calls[0][0].data).toMatchObject({ email: 'buyer@example.com', amountPaise: 16864, gstPaise: 3036, totalPaise: 19900, startupLimit: 50 });
  });

  it('won’t sell a pack bigger than the selection needs (120 match: Growth holds them all, Pro is refused)', async () => {
    expect((await checkout(req('/x', body({ pack: 'GROWTH' })))).status).toBe(200);
    const r = await checkout(req('/x', body({ pack: 'PRO' })));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/fits in Growth/);
  });

  it('validates the invoice details', async () => {
    expect((await checkout(req('/x', body({ billing: { billingType: 'INDIVIDUAL', billingName: 'P', billingState: '29' } })))).status).toBe(400);
    expect((await checkout(req('/x', body({ billing: { billingType: 'INDIVIDUAL', billingName: 'Priya', billingState: '99' } })))).status).toBe(400);
    expect((await checkout(req('/x', body({ billing: { billingType: 'GST', billingName: 'Acme', billingGstin: '29ABCDE1234F1Z0' } })))).status).toBe(400);
  });

  it('needs the registered address for a GST invoice, and stores it for the invoice', async () => {
    const gst = { billingType: 'GST', billingName: 'Acme AI Pvt Ltd', billingGstin: '29ABCDE1234F1ZW' };
    expect((await checkout(req('/x', body({ billing: gst })))).status).toBe(400); // no address
    expect((await checkout(req('/x', body({ billing: { ...gst, billingAddressLine1: '12 MG Road', billingCity: 'Bengaluru', billingPostalCode: '0123' } })))).status).toBe(400); // bad PIN
    const r = await checkout(req('/x', body({ billing: { ...gst, billingAddressLine1: '12 MG Road', billingCity: 'Bengaluru', billingPostalCode: '560001' } })));
    expect(r.status).toBe(200);
    expect(db.fundingDataPurchase.create.mock.calls.at(-1)![0].data.billingDetails).toMatchObject({
      billingType: 'GST', billingGstin: '29ABCDE1234F1ZW', billingState: '29', billingAddressLine1: '12 MG Road', billingCity: 'Bengaluru', billingPostalCode: '560001',
    });
  });

  it('keeps individuals quick: name and state only', async () => {
    expect((await checkout(req('/x', body()))).status).toBe(200);
  });
});

describe('payment activation', () => {
  it('is idempotent and subscribes the buyer once', async () => {
    db.fundingDataPurchase.findUnique.mockResolvedValue({ id: 'p1', email: 'buyer@example.com', pack: 'STARTER', totalPaise: 19900, consentAt: new Date() });
    db.fundingDataPurchase.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await activateFundingPurchase('order_1', 'pay_1')).toBe('activated');
    expect(await activateFundingPurchase('order_1', 'pay_1')).toBe('already');
    expect(db.newsletterSubscriber.upsert).toHaveBeenCalledTimes(1);
    expect(db.newsletterSubscriber.upsert.mock.calls[0][0].create).toMatchObject({ source: 'funding_paid', emailVerified: true });
    expect(invoice.emailInvoice).toHaveBeenCalledWith('funding', 'p1');
    const window = db.fundingDataPurchase.updateMany.mock.calls[0][0].data.accessExpiresAt.getTime() - Date.now();
    expect(Math.round(window / 864e5)).toBe(7);
  });
});

describe('paid download', () => {
  const paid = { id: 'p1', email: 'b@x.co', pack: 'STARTER', status: 'SUCCESS', refundedAt: null, accessExpiresAt: new Date(Date.now() + 864e5), startupLimit: 50, filters: {}, downloadCount: 0 };
  const get = (t = purchaseToken('p1')) => download(req(`/api/funding-data/download?t=${encodeURIComponent(t)}`));

  it('serves the Excel file for a paid, valid purchase and counts the download', async () => {
    db.fundingDataPurchase.findUnique.mockResolvedValue(paid);
    db.fundingDataPurchase.updateMany.mockResolvedValue({ count: 1 });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('spreadsheetml');
    expect(db.fundingDataPurchase.updateMany.mock.calls[0][0].where).toMatchObject({ downloadCount: { lt: 5 } });
  });

  it.each([
    ['a forged link', 'bad.token', paid, 'invalid'],
    ['an unpaid order', undefined, { ...paid, status: 'PENDING' }, 'invalid'],
    ['a refunded order', undefined, { ...paid, refundedAt: new Date() }, 'refunded'],
    ['an expired link', undefined, { ...paid, accessExpiresAt: new Date(Date.now() - 1000) }, 'expired'],
  ])('refuses %s', async (_n, token, row, reason) => {
    db.fundingDataPurchase.findUnique.mockResolvedValue(row);
    const r = await get(token);
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toContain(`data=${reason}`);
  });

  it('refuses once the download limit is used up', async () => {
    db.fundingDataPurchase.findUnique.mockResolvedValue(paid);
    db.fundingDataPurchase.updateMany.mockResolvedValue({ count: 0 });
    expect((await get()).headers.get('location')).toContain('data=limit');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plans can't be paid for until the invoice details (name, address, GSTIN for businesses) are saved: GST invoices
// need them, and Razorpay's form doesn't collect them. The UI asks first; these check the server enforces it.

const db = vi.hoisted(() => ({
  jobBoardEmployer: { findUnique: vi.fn(), count: vi.fn(async () => 0) },
  jobBoardPayment: { create: vi.fn(async () => ({})) },
  eventOrganizer: { findUnique: vi.fn(), count: vi.fn(async () => 0) },
  organizerPayment: { create: vi.fn(async () => ({})) },
  event: { findFirst: vi.fn() },
}));
const ordersCreate = vi.hoisted(() => vi.fn(async () => ({ id: 'order_test_1' })));
const createRazorpayOrder = vi.hoisted(() => vi.fn(async () => ({ orderId: 'order_test_2', keyId: 'rzp_test_key' })));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/rate-limit', () => ({ apiRateLimit: {}, checkRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: vi.fn(async () => ({ id: 'emp1', email: 'owner@acme.ai', role: 'OWNER', memberName: 'Owner' })) }));
vi.mock('@/lib/employer/permissions', () => ({ can: () => true, forbidden: () => new Response(null, { status: 403 }) }));
vi.mock('@/lib/organizer-auth/require-permission', () => ({ requirePermission: vi.fn(async () => ({ organizerId: 'org1', email: 'host@events.in', name: 'Host' })) }));
vi.mock('razorpay', () => ({ default: class { orders = { create: ordersCreate }; } }));
vi.mock('@/lib/billing/razorpay', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/razorpay')>()),
  razorpayKeys: () => ({ keyId: 'rzp_test_key', keySecret: 'test_secret' }),
  createRazorpayOrder,
}));

import { POST as employerCheckout } from '@/app/api/employer/billing/checkout/route';
import { POST as hostCheckout } from '@/app/api/organizer/billing/checkout/route';

const complete = {
  billingType: 'GST', billingName: 'Acme AI Pvt Ltd', billingGstin: '29ABCDE1234F1ZW', billingAddressLine1: '12 MG Road', billingAddressLine2: null,
  billingCity: 'Bengaluru', billingState: '29', billingPostalCode: '560001', billingCountry: 'IN', billingPoNumber: null, billingEmail: 'accounts@acme.ai', billingCcEmails: [],
};
const empty = { billingType: null, billingName: null, billingGstin: null, billingAddressLine1: null, billingAddressLine2: null, billingCity: null, billingState: null, billingPostalCode: null, billingCountry: 'IN', billingPoNumber: null, billingEmail: null, billingCcEmails: [] };
const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
});

describe('employer plan checkout', () => {
  const employer = (billing: object) => db.jobBoardEmployer.findUnique.mockResolvedValue({ ...billing, companyName: 'Acme AI', email: 'owner@acme.ai', emailVerified: true, foundingMemberAt: null, foundingLostAt: null });

  it('asks for invoice details before creating any order', async () => {
    employer(empty);
    const r = await employerCheckout(req({ plan: 'PRO', cycle: 'MONTHLY' }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: 'BILLING_REQUIRED' });
    expect(ordersCreate).not.toHaveBeenCalled();
    expect(db.jobBoardPayment.create).not.toHaveBeenCalled();
  });

  it('a GST buyer without an address is not complete', async () => {
    employer({ ...complete, billingAddressLine1: null });
    expect((await employerCheckout(req({ plan: 'PRO' }))).status).toBe(409);
  });

  it('goes straight to payment once the details are saved', async () => {
    employer(complete);
    const r = await employerCheckout(req({ plan: 'PRO', cycle: 'MONTHLY' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ orderId: 'order_test_1', keyId: 'rzp_test_key' });
  });
});

describe('host (organizer) checkout', () => {
  it('asks for invoice details before creating any order', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ ...empty, email: 'host@events.in' });
    const r = await hostCheckout(req({ kind: 'PRO', cycle: 'MONTHLY' }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: 'BILLING_REQUIRED' });
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it('an individual needs a name, address, state and PIN, but no GSTIN', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ ...complete, billingType: 'INDIVIDUAL', billingName: 'Priya Rao', billingGstin: null, email: 'host@events.in' });
    const r = await hostCheckout(req({ kind: 'PRO', cycle: 'MONTHLY' }));
    expect(r.status).toBe(200);
    expect(createRazorpayOrder).toHaveBeenCalledTimes(1);
  });
});

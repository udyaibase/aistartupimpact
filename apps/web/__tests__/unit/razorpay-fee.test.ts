import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMany = vi.fn().mockResolvedValue({ count: 1 });
vi.mock('@udyaibase/database', () => ({ prisma: { razorpayFee: { createMany: (...a: unknown[]) => createMany(...a) } } }));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn(); } }));

const reply = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body });

describe('saving Razorpay’s fee when a payment succeeds', () => {
  beforeEach(() => {
    createMany.mockClear();
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_x');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('stores the fee and the GST inside it for a captured payment', async () => {
    vi.stubGlobal('fetch', reply({ status: 'captured', fee: 2360, tax: 360, method: 'upi' }));
    const { saveFee } = await import('@/lib/billing/razorpay-fee');
    expect(await saveFee('pay_ABC')).toBe(true);
    expect(createMany).toHaveBeenCalledWith({ data: [{ paymentId: 'pay_ABC', feePaise: 2360, taxPaise: 360, method: 'upi' }], skipDuplicates: true });
  });

  it('stores nothing while the payment is not captured, or the numbers make no sense', async () => {
    const { saveFee } = await import('@/lib/billing/razorpay-fee');
    for (const body of [{ status: 'authorized', fee: null }, { status: 'captured', fee: 100, tax: 500 }, { status: 'captured', fee: -1, tax: 0 }, { status: 'captured' }, null]) {
      vi.stubGlobal('fetch', reply(body));
      expect(await saveFee('pay_ABC')).toBe(false);
    }
    vi.stubGlobal('fetch', reply({}, false));
    expect(await saveFee('pay_ABC')).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('never throws into the payment, and ignores ids that are not Razorpay payments', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { recordRazorpayFee } = await import('@/lib/billing/razorpay-fee');
    expect(() => recordRazorpayFee('pay_ABC')).not.toThrow();
    expect(() => recordRazorpayFee(null)).not.toThrow();
    expect(() => recordRazorpayFee('manual_123')).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createMany).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

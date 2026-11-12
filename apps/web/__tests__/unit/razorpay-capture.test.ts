import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureCaptured } from '@/lib/billing/razorpay';

/** Each call to fetch returns the next queued Razorpay response. */
function mockRazorpay(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    const next = responses.shift() ?? { status: 500, body: {} };
    const status = next.status ?? 200;
    return { ok: status < 400, status, json: async () => next.body } as Response;
  }));
  return calls;
}

const payment = (over: Record<string, unknown> = {}) => ({ id: 'pay_1', order_id: 'order_1', amount: 118000, currency: 'INR', status: 'captured', ...over });

describe('ensureCaptured', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a captured payment for this order and amount', async () => {
    mockRazorpay([{ body: payment() }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: true });
  });

  it('rejects a payment for a different order, amount or currency', async () => {
    mockRazorpay([{ body: payment({ order_id: 'order_other' }) }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: false, reason: 'mismatch' });
    mockRazorpay([{ body: payment({ amount: 100 }) }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: false, reason: 'mismatch' });
    mockRazorpay([{ body: payment({ currency: 'USD' }) }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('captures an authorised payment, then accepts it', async () => {
    const calls = mockRazorpay([{ body: payment({ status: 'authorized' }) }, { body: payment() }, { body: payment() }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: true });
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.razorpay.com', '')}`)).toEqual([
      'GET /v1/payments/pay_1', 'POST /v1/payments/pay_1/capture', 'GET /v1/payments/pay_1',
    ]);
  });

  it('treats "already captured" from a parallel capture as fine (re-reads the payment)', async () => {
    mockRazorpay([{ body: payment({ status: 'authorized' }) }, { status: 400, body: { error: { description: 'already captured' } } }, { body: payment() }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: true });
  });

  it('does not activate a failed or refunded payment', async () => {
    mockRazorpay([{ body: payment({ status: 'failed' }) }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: false, reason: 'not_captured' });
    mockRazorpay([{ body: payment({ status: 'refunded' }) }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: false, reason: 'not_captured' });
  });

  it('returns an error (never ok) when Razorpay is unreachable', async () => {
    mockRazorpay([{ status: 503, body: {} }]);
    expect(await ensureCaptured('pay_1', 'order_1', 118000)).toEqual({ ok: false, reason: 'error' });
  });
});

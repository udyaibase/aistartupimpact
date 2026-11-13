import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// A tiny in-memory AdvPayment table with the semantics the webhook relies on (atomic updateMany by status).
type Row = { id: string; founderId: string; packageId: string | null; zoneActivationId: string | null; socialPostOrderId: string | null;
  purpose: string; metadata: unknown; totalPaise: number; currency: string; razorpayOrderId: string; status: string; razorpayPaymentId: string | null };
const rows = new Map<string, Row>();
const db = vi.hoisted(() => ({
  advPayment: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  advPackage: { update: vi.fn(), create: vi.fn() },
  advZoneActivation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  advSocialPostOrder: { update: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { POST } from '@/app/api/webhooks/razorpay-advertise/route';

const SECRET = 'test_webhook_secret';
const send = (body: unknown, signature?: string) => {
  const raw = JSON.stringify(body);
  const sig = signature ?? crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return POST(new Request('http://x/api/webhooks/razorpay-advertise', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': sig } }) as never);
};
const captured = (paymentId: string, amount = 11800, event = 'payment.captured') =>
  ({ event, payload: { payment: { entity: { id: paymentId, order_id: 'order_1', status: 'captured', amount, currency: 'INR' } } } });
const failed = () => ({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_bad', order_id: 'order_1', status: 'failed' } } } });

beforeEach(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  vi.clearAllMocks();
  rows.clear();
  rows.set('p1', { id: 'p1', founderId: 'f1', packageId: 'pkg1', zoneActivationId: null, socialPostOrderId: null, purpose: 'PACKAGE_PURCHASE',
    metadata: { tier: 'STARTER' }, totalPaise: 11800, currency: 'INR', razorpayOrderId: 'order_1', status: 'PENDING', razorpayPaymentId: null });
  db.advPayment.findUnique.mockImplementation(async ({ where }: { where: { razorpayOrderId: string } }) =>
    [...rows.values()].find((r) => r.razorpayOrderId === where.razorpayOrderId) ?? null);
  db.advPayment.updateMany.mockImplementation(async ({ where, data }: { where: { id?: string; razorpayOrderId?: string; status: string | { in: string[] } }; data: Partial<Row> }) => {
    let count = 0;
    for (const r of rows.values()) {
      const idOk = where.id ? r.id === where.id : r.razorpayOrderId === where.razorpayOrderId;
      const st = typeof where.status === 'string' ? [where.status] : where.status.in;
      if (idOk && st.includes(r.status)) { Object.assign(r, data); count++; }
    }
    return { count };
  });
  db.advPayment.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.get(where.id)!, data));
});

describe('razorpay-advertise webhook', () => {
  it('rejects a bad signature', async () => {
    const res = await send(captured('pay_1'), 'deadbeef');
    expect(res.status).toBe(400);
    expect(db.advPackage.update).not.toHaveBeenCalled();
  });

  it('activates a paid package once', async () => {
    const res = await send(captured('pay_1'));
    expect(res.status).toBe(200);
    expect(rows.get('p1')!.status).toBe('SUCCESS');
    expect(db.advPackage.update).toHaveBeenCalledTimes(1);
  });

  it('applies a payment only once when payment.captured and order.paid arrive together', async () => {
    await Promise.all([send(captured('pay_1')), send(captured('pay_1', 11800, 'order.paid'))]);
    expect(db.advPackage.update).toHaveBeenCalledTimes(1);
  });

  it('activates when a failed attempt is followed by a successful retry on the same order', async () => {
    await send(failed());
    expect(rows.get('p1')!.status).toBe('FAILED');
    await send(captured('pay_2'));
    expect(rows.get('p1')!.status).toBe('SUCCESS');
    expect(rows.get('p1')!.razorpayPaymentId).toBe('pay_2');
    expect(db.advPackage.update).toHaveBeenCalledTimes(1);
  });

  it('does not let a late failure undo a successful payment', async () => {
    await send(captured('pay_1'));
    await send(failed());
    expect(rows.get('p1')!.status).toBe('SUCCESS');
  });

  it('does not activate when the paid amount differs from the order total', async () => {
    const res = await send(captured('pay_1', 100));
    expect(await res.json()).toEqual({ status: 'amount_mismatch' });
    expect(rows.get('p1')!.status).toBe('PENDING');
    expect(db.advPackage.update).not.toHaveBeenCalled();
  });

  it('releases the claim if activation fails, so Razorpay can retry', async () => {
    db.advPackage.update.mockRejectedValueOnce(new Error('db down'));
    const res = await send(captured('pay_1'));
    expect(res.status).toBe(500);
    expect(rows.get('p1')!.status).toBe('PENDING');
    await send(captured('pay_1'));
    expect(rows.get('p1')!.status).toBe('SUCCESS');
  });
});

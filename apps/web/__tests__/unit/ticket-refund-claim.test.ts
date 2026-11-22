import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  eventRegistration: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  eventTicketTier: { updateMany: vi.fn() },
}));
const rzp = vi.hoisted(() => {
  class RazorpayApiError extends Error {}
  return { razorpayApi: vi.fn(), refundPayment: vi.fn(), RazorpayApiError };
});
const email = vi.hoisted(() => vi.fn());

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/billing/razorpay', () => ({ ...rzp, razorpayKeys: () => ({ keyId: 'k', keySecret: 's' }) }));
vi.mock('@/lib/ops/alert', () => ({ opsAlert: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: email }));
vi.mock('@/lib/events/register-event', () => ({ handleNewsletterSubscription: vi.fn(), sendConfirmationEmail: vi.fn() }));
vi.mock('@/lib/revalidate', () => ({ refreshPaths: vi.fn() }));

import { refundTicket } from '@/lib/events/tickets';

const paid = { id: 'reg1', paymentStatus: 'PAID', razorpayPaymentId: 'pay_1', amountPaise: 50_000, guestEmail: 'a@b.co', guestName: 'A', ticketTierId: 't1', event: { title: 'Meetup' } };

describe('a host refunds a paid ticket (PAY-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.eventRegistration.findUnique.mockResolvedValue(paid);
    db.eventRegistration.update.mockResolvedValue({});
    db.eventTicketTier.updateMany.mockResolvedValue({ count: 1 });
  });

  it('claims the ticket before refunding, and refunds once', async () => {
    db.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
    rzp.razorpayApi.mockResolvedValue({ id: 'rfnd_1' });
    expect(await refundTicket('reg1', 'host')).toEqual({ ok: true });
    expect(db.eventRegistration.updateMany).toHaveBeenCalledWith({ where: { id: 'reg1', paymentStatus: 'PAID' }, data: { paymentStatus: 'REFUND_PENDING' } });
    expect(rzp.razorpayApi).toHaveBeenCalledTimes(1);
  });

  it('a second request at the same time gets nothing to claim and never calls Razorpay', async () => {
    db.eventRegistration.updateMany.mockResolvedValue({ count: 0 });
    const r = await refundTicket('reg1', 'host');
    expect(r.ok).toBe(false);
    expect(rzp.razorpayApi).not.toHaveBeenCalled();
  });

  it('Razorpay says no: the ticket goes back to paid', async () => {
    db.eventRegistration.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    rzp.razorpayApi.mockRejectedValue(new rzp.RazorpayApiError('Payment already refunded'));
    const r = await refundTicket('reg1', 'host');
    expect(r).toEqual({ ok: false, error: 'Payment already refunded' });
    expect(db.eventRegistration.updateMany).toHaveBeenLastCalledWith({ where: { id: 'reg1', paymentStatus: 'REFUND_PENDING' }, data: { paymentStatus: 'PAID' } });
  });

  it('no answer from Razorpay: it stays pending, so nobody can refund it again by retrying', async () => {
    db.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
    rzp.razorpayApi.mockRejectedValue(new Error('timeout'));
    const r = await refundTicket('reg1', 'host');
    expect(r.ok).toBe(false);
    expect(db.eventRegistration.updateMany).toHaveBeenCalledTimes(1);
  });
});

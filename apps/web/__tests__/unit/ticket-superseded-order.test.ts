import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  eventRegistration: { findUnique: vi.fn(), updateMany: vi.fn() },
  event: { findUnique: vi.fn() },
}));
const rzp = vi.hoisted(() => ({ razorpayApi: vi.fn(), refundPayment: vi.fn() }));
const alert = vi.hoisted(() => vi.fn());
const email = vi.hoisted(() => vi.fn());

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/billing/razorpay', () => ({ ...rzp, razorpayKeys: () => ({ keyId: 'k', keySecret: 's' }), RazorpayApiError: class extends Error {} }));
vi.mock('@/lib/ops/alert', () => ({ opsAlert: alert }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: email }));
vi.mock('@/lib/events/register-event', () => ({ handleNewsletterSubscription: vi.fn(), sendConfirmationEmail: vi.fn() }));
vi.mock('@/lib/revalidate', () => ({ refreshPaths: vi.fn() }));

import { recoverSupersededTicketOrder } from '@/lib/events/tickets';

const order = { amount: 50_000, notes: { purpose: 'EVENT_TICKET', registrationId: 'reg1', eventId: 'ev1' } };
const reg = { id: 'reg1', eventId: 'ev1', amountPaise: 50_000, guestEmail: 'a@b.co', guestName: 'A' };

describe('a ticket payment on an order we no longer hold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alert.mockResolvedValue(true);
    rzp.razorpayApi.mockResolvedValue(order);
    db.eventRegistration.findUnique.mockResolvedValue(reg);
    db.event.findUnique.mockResolvedValue({ title: 'Meetup' });
  });

  it('points an unpaid registration back at the paid order', async () => {
    db.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
    expect(await recoverSupersededTicketOrder('order_old', 'pay_1')).toBe('adopted');
    expect(db.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: 'reg1', paymentStatus: { in: ['PENDING', 'FAILED', 'EXPIRED'] } },
      data: { razorpayOrderId: 'order_old' },
    });
    expect(rzp.refundPayment).not.toHaveBeenCalled();
  });

  it('refunds in full when the ticket was already paid through the newer order', async () => {
    db.eventRegistration.updateMany.mockResolvedValue({ count: 0 });
    rzp.refundPayment.mockResolvedValue('rfnd_1');
    expect(await recoverSupersededTicketOrder('order_old', 'pay_2')).toBe('refunded');
    expect(rzp.refundPayment).toHaveBeenCalledWith('pay_2', 50_000, expect.objectContaining({ registrationId: 'reg1' }), { reverseTransfers: true });
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('refunds when the price no longer matches, without touching the registration', async () => {
    db.eventRegistration.findUnique.mockResolvedValue({ ...reg, amountPaise: 80_000 });
    rzp.refundPayment.mockResolvedValue('rfnd_2');
    expect(await recoverSupersededTicketOrder('order_old', 'pay_3')).toBe('refunded');
    expect(db.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  it('raises an urgent alert when the refund itself fails', async () => {
    db.eventRegistration.updateMany.mockResolvedValue({ count: 0 });
    rzp.refundPayment.mockRejectedValue(new Error('insufficient balance'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await recoverSupersededTicketOrder('order_old', 'pay_4')).toBe('refunded');
    expect(alert).toHaveBeenCalledWith('ticket-orphan-payment', expect.any(String), expect.any(Array), 1);
    expect(email).not.toHaveBeenCalled();
  });

  it('ignores orders that are not ticket orders', async () => {
    rzp.razorpayApi.mockResolvedValue({ amount: 100, notes: { purpose: 'EMPLOYER_PLAN' } });
    expect(await recoverSupersededTicketOrder('order_x', 'pay_5')).toBe('unknown');
    expect(rzp.refundPayment).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
const audit = vi.fn();
vi.mock('@/lib/audit-log', () => ({ logAuditEvent: (e: any) => audit(e) }));
const sendEmail = vi.fn();
vi.mock('@/lib/email-send', () => ({ sendEmailFireAndForget: (o: any) => sendEmail(o) }));

const db = {
  jobBoardEmployer: { update: vi.fn((a: any) => a) },
  jobBoardListing: { updateMany: vi.fn((a: any) => a) },
  jobBoardPayment: { findUnique: vi.fn(), update: vi.fn() },
  eventOrganizer: { update: vi.fn((a: any) => a) },
  organizerPayment: { findUnique: vi.fn(), update: vi.fn() },
  event: { update: vi.fn(), updateMany: vi.fn((a: any) => a) },
  $transaction: vi.fn(async (ops: any[]) => ops),
};
vi.mock('@udyaibase/database', () => ({ prisma: db }));

const asRole = (role: string) => mockSession.mockResolvedValue({ user: { id: 'a1', email: 'ops@udyaibase.com', role } });
const empPayment = (over: object = {}) => ({
  id: 'p1', status: 'SUCCESS', totalPaise: 590000, razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', refundedAt: null,
  paidByEmail: 'cfo@acme.in', invoiceNumber: 'UDB/2026-27/000001', Employer: { id: 'e1', email: 'founder@acme.in', companyName: 'Acme' }, ...over,
});

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
  process.env.RAZORPAY_KEY_SECRET = 'secret_x';
  db.$transaction.mockImplementation(async (ops: any[]) => ops);
});
afterEach(() => vi.unstubAllGlobals());

describe('Admin refunds', () => {
  it('is super-admin only and needs a reason', async () => {
    const { refundPaymentAction } = await import('@/app/(dashboard)/billing/actions');
    asRole('EDITOR_IN_CHIEF');
    expect((await refundPaymentAction({ source: 'EMPLOYER', id: 'p1', amountRupees: 5900, reason: 'dup', endAccess: false })).success).toBe(false);
    asRole('SUPER_ADMIN');
    expect((await refundPaymentAction({ source: 'EMPLOYER', id: 'p1', amountRupees: 5900, reason: '', endAccess: false })).success).toBe(false);
    expect(db.jobBoardPayment.findUnique).not.toHaveBeenCalled();
  });

  it('refuses already-refunded, failed and over-total refunds', async () => {
    const { refundPaymentAction } = await import('@/app/(dashboard)/billing/actions');
    asRole('SUPER_ADMIN');
    db.jobBoardPayment.findUnique.mockResolvedValueOnce(empPayment({ refundedAt: new Date() }));
    expect((await refundPaymentAction({ source: 'EMPLOYER', id: 'p1', amountRupees: 100, reason: 'charged twice', endAccess: false })).success).toBe(false);
    db.jobBoardPayment.findUnique.mockResolvedValueOnce(empPayment({ status: 'FAILED' }));
    expect((await refundPaymentAction({ source: 'EMPLOYER', id: 'p1', amountRupees: 100, reason: 'charged twice', endAccess: false })).success).toBe(false);
    db.jobBoardPayment.findUnique.mockResolvedValueOnce(empPayment());
    expect((await refundPaymentAction({ source: 'EMPLOYER', id: 'p1', amountRupees: 6000, reason: 'charged twice', endAccess: false })).success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.jobBoardPayment.update).not.toHaveBeenCalled();
  });

  it('refunds online payments through Razorpay, records it, ends the plan and emails the payer', async () => {
    const { refundPaymentAction } = await import('@/app/(dashboard)/billing/actions');
    asRole('SUPER_ADMIN');
    db.jobBoardPayment.findUnique.mockResolvedValue(empPayment());
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'rfnd_1' }) });
    const r = await refundPaymentAction({ source: 'EMPLOYER', id: 'p1', amountRupees: 5900, reason: 'Cancelled within 7 days', endAccess: true });
    expect(r).toMatchObject({ success: true, refundId: 'rfnd_1', online: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/payments/pay_1/refund');
    expect(JSON.parse(init.body).amount).toBe(590000);
    expect(db.jobBoardPayment.update.mock.calls[0][0].data).toMatchObject({ refundId: 'rfnd_1', refundAmountPaise: 590000, refundedByEmail: 'ops@udyaibase.com' });
    expect(db.jobBoardEmployer.update.mock.calls[0][0].data.plan).toBe('FREE');
    expect(sendEmail.mock.calls[0][0].to).toBe('cfo@acme.in');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'BILLING_PAYMENT' }));
  });

  it('records nothing if Razorpay rejects the refund', async () => {
    const { refundPaymentAction } = await import('@/app/(dashboard)/billing/actions');
    asRole('SUPER_ADMIN');
    db.jobBoardPayment.findUnique.mockResolvedValue(empPayment());
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { description: 'The refund amount exceeds the captured amount' } }) });
    const r = await refundPaymentAction({ source: 'EMPLOYER', id: 'p1', amountRupees: 100, reason: 'partial', endAccess: true });
    expect(r).toEqual({ success: false, error: 'The refund amount exceeds the captured amount' });
    expect(db.jobBoardPayment.update).not.toHaveBeenCalled();
    expect(db.jobBoardEmployer.update).not.toHaveBeenCalled();
  });

  it('manual payments are recorded without calling Razorpay; a refunded Boost ends only that event’s boost', async () => {
    const { refundPaymentAction } = await import('@/app/(dashboard)/billing/actions');
    asRole('SUPER_ADMIN');
    db.organizerPayment.findUnique.mockResolvedValue({
      id: 'h1', status: 'SUCCESS', totalPaise: 94282, razorpayOrderId: 'manual_abc', razorpayPaymentId: null, refundedAt: null, kind: 'BOOST', eventId: 'ev1',
      paidByEmail: null, invoiceNumber: null, organizer: { id: 'o1', email: 'host@club.in', name: 'Club' },
    });
    const r = await refundPaymentAction({ source: 'HOST', id: 'h1', amountRupees: 942.82, reason: 'Event cancelled', endAccess: true });
    expect(r).toMatchObject({ success: true, online: false, refundId: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.event.update.mock.calls[0][0]).toMatchObject({ where: { id: 'ev1' }, data: { boostedAt: null } });
    expect(db.eventOrganizer.update).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][0].to).toBe('host@club.in');
  });
});

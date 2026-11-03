import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());
const requestEventApproved = vi.hoisted(() => vi.fn());
const requestOrganizerSuspended = vi.hoisted(() => vi.fn());
vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/audit-log', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/email-send', () => ({ sendEmailFireAndForget: (o: any) => sendEmail(o) }));
vi.mock('@/lib/refresh-public', () => ({ refreshPublic: vi.fn(), requestEventApproved, requestOrganizerSuspended }));

const db = vi.hoisted(() => ({
  event: { findFirst: vi.fn(), update: vi.fn((a: any) => ({ op: 'event.update', ...a })), updateMany: vi.fn((a: any) => ({ op: 'event.updateMany', ...a })) },
  eventOrganizer: { findUnique: vi.fn(), update: vi.fn((a: any) => ({ op: 'organizer.update', ...a })) },
  contentReport: { updateMany: vi.fn((a: any) => ({ op: 'reports', ...a })) },
  $transaction: vi.fn(async (ops: any[]) => ops),
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

const asRole = (role: string) => mockSession.mockResolvedValue({ user: { id: 'admin-1', email: 'ops@udyaibase.com', role } });
const pending = (o: Partial<{ verifiedAt: Date | null; status: string }> = {}) => ({
  id: 'ev1', title: 'AI Meetup', slug: 'ai-meetup', heldAt: null, organizerId: 'o1',
  organizer: { email: 'host@community.org', verifiedAt: null, status: 'ACTIVE', ...o },
});

describe('admin event review', () => {
  beforeEach(() => { vi.clearAllMocks(); db.$transaction.mockImplementation(async (ops: any[]) => ops); });

  it('only senior admins can review; only super admins can suspend', async () => {
    const { approveEventAction, suspendOrganizerAction } = await import('@/app/(dashboard)/events/review/actions');
    asRole('EVENT_ORGANIZER');
    expect((await approveEventAction('ev1')).success).toBe(false);
    asRole('EDITOR_IN_CHIEF');
    expect((await suspendOrganizerAction('o1', 'scam events')).success).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('approving a first event publishes it, makes the organizer verified, emails them and triggers go-live steps', async () => {
    const { approveEventAction } = await import('@/app/(dashboard)/events/review/actions');
    asRole('EDITOR_IN_CHIEF');
    db.event.findFirst.mockResolvedValue(pending());
    expect((await approveEventAction('ev1')).success).toBe(true);
    const ops = db.$transaction.mock.calls[0][0];
    expect(ops[0].data).toMatchObject({ status: 'PUBLISHED', heldAt: null });
    expect(ops.some((o: any) => o.op === 'organizer.update' && o.data.verifiedAt)).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(requestEventApproved).toHaveBeenCalledWith('ev1');
  });

  it('a suspended organizer’s event cannot be approved', async () => {
    const { approveEventAction } = await import('@/app/(dashboard)/events/review/actions');
    asRole('SUPER_ADMIN');
    db.event.findFirst.mockResolvedValue(pending({ status: 'SUSPENDED' }));
    expect((await approveEventAction('ev1')).success).toBe(false);
  });

  it('declining needs a note, sends the event back to draft and tells the organizer why', async () => {
    const { declineEventAction } = await import('@/app/(dashboard)/events/review/actions');
    asRole('EDITOR_IN_CHIEF');
    db.event.findFirst.mockResolvedValue(pending());
    expect((await declineEventAction('ev1', '')).success).toBe(false);
    expect((await declineEventAction('ev1', 'Add the real venue address')).success).toBe(true);
    expect(db.$transaction.mock.calls[0][0][0].data).toMatchObject({ status: 'DRAFT' });
    expect(sendEmail.mock.calls[0][0].html).toContain('Add the real venue address');
  });

  it('suspending cancels upcoming events at once, blocks sign-in and hands attendee notices to the website', async () => {
    const { suspendOrganizerAction } = await import('@/app/(dashboard)/events/review/actions');
    asRole('SUPER_ADMIN');
    db.eventOrganizer.findUnique.mockResolvedValue({ id: 'o1', name: 'Fake Host', email: 'fake@scam.in', status: 'ACTIVE' });
    db.$transaction.mockResolvedValue([{}, { count: 2 }]);
    const r = await suspendOrganizerAction('o1', 'Selling fake tickets');
    expect(r).toMatchObject({ success: true, eventsCancelled: 2 });
    expect(db.eventOrganizer.update.mock.calls[0][0].data).toMatchObject({ status: 'SUSPENDED', suspendReason: 'Selling fake tickets' });
    expect(db.event.updateMany.mock.calls[0][0]).toMatchObject({ data: { status: 'CANCELLED', reviewedAt: null } });
    expect(requestOrganizerSuspended).toHaveBeenCalledWith('o1');
  });

  it('Udyaibase’s own accounts cannot be suspended', async () => {
    const { suspendOrganizerAction } = await import('@/app/(dashboard)/events/review/actions');
    asRole('SUPER_ADMIN');
    db.eventOrganizer.findUnique.mockResolvedValue({ id: 'o2', name: 'Udyaibase', email: 'events@udyaibase.com', status: 'ACTIVE' });
    expect((await suspendOrganizerAction('o2', 'testing reason')).success).toBe(false);
  });
});

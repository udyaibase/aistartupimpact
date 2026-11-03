import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const DAY = 864e5;
const mockSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/audit-log', () => ({ logAuditEvent: vi.fn() }));

const sendEmail = vi.fn();
vi.mock('@/lib/email-send', () => ({ sendEmailFireAndForget: (o: any) => sendEmail(o) }));

const db = {
  jobBoardEmployer: { findUnique: vi.fn(), update: vi.fn((a: any) => a), findMany: vi.fn() },
  jobBoardListing: { updateMany: vi.fn((a: any) => a), update: vi.fn(), findUnique: vi.fn() },
  jobBoardPayment: { create: vi.fn((a: any) => a) },
  eventOrganizer: { findUnique: vi.fn(), update: vi.fn((a: any) => a), findMany: vi.fn() },
  event: { findMany: vi.fn(), update: vi.fn((a: any) => a), updateMany: vi.fn((a: any) => a) },
  organizerPayment: { create: vi.fn((a: any) => a) },
  contentReport: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(async (ops: any[]) => ops),
};
vi.mock('@udyaibase/database', () => ({ prisma: db }));

const asRole = (role: string | null) => mockSession.mockResolvedValue(role ? { user: { id: 'admin-1', email: 'ops@udyaibase.com', role } } : null);

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (ops: any[]) => ops);
});

describe('Admin plan grants', () => {
  it('only super admins can grant plans', async () => {
    const { grantPlanAction } = await import('@/app/(dashboard)/plans/actions');
    asRole('EDITOR_IN_CHIEF');
    const r = await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'PRO', days: 30, amountRupees: 5899, reference: 'INV-1' });
    expect(r.success).toBe(false);
    expect(db.jobBoardEmployer.update).not.toHaveBeenCalled();
  });

  it('validates days and requires a reference', async () => {
    const { grantPlanAction } = await import('@/app/(dashboard)/plans/actions');
    asRole('SUPER_ADMIN');
    expect((await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'PRO', days: 0, amountRupees: 0, reference: 'INV-1' })).success).toBe(false);
    expect((await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'PRO', days: 30, amountRupees: 0, reference: 'x' })).success).toBe(false);
    // Retired names and unknown values are refused; only Growth, Pro and Scale can be granted.
    expect((await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'FEATURED', days: 30, amountRupees: 0, reference: 'INV-1' })).success).toBe(false);
    expect((await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'BOGUS', days: 30, amountRupees: 0, reference: 'INV-1' })).success).toBe(false);
  });

  it('grants an employer plan: 30 days, job limit, featured jobs, payment row with GST split', async () => {
    const { grantPlanAction } = await import('@/app/(dashboard)/plans/actions');
    asRole('SUPER_ADMIN');
    db.jobBoardEmployer.findUnique.mockResolvedValue({ companyName: 'Acme', plan: 'FREE', planExpiresAt: null });
    const r = await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'PRO', days: 30, amountRupees: 5900, reference: 'INV-1' });
    expect(r.success).toBe(true);
    const upd = db.jobBoardEmployer.update.mock.calls[0][0];
    expect(upd.data.plan).toBe('PRO');
    expect(upd.data.planCycle).toBe('MONTHLY');
    expect(upd.data.maxActiveJobs).toBe(15);
    expect(Math.round((upd.data.planExpiresAt.getTime() - Date.now()) / DAY)).toBe(30);
    expect(db.jobBoardListing.updateMany.mock.calls[0][0].data.isFeatured).toBe(true);
    const pay = db.jobBoardPayment.create.mock.calls[0][0].data;
    expect(pay.totalPaise).toBe(590000);
    expect(pay.amountPaise).toBe(500000);
    expect(pay.gstPaise).toBe(90000);
    expect(pay.status).toBe('SUCCESS');
    expect(pay.razorpayOrderId).toMatch(/^manual_/);
  });

  it('extending the same active plan stacks onto the current end date', async () => {
    const { grantPlanAction } = await import('@/app/(dashboard)/plans/actions');
    asRole('SUPER_ADMIN');
    const end = new Date(Date.now() + 10 * DAY);
    // A legacy Premium workspace extended with Scale (its successor) stacks too.
    db.jobBoardEmployer.findUnique.mockResolvedValue({ companyName: 'Acme', plan: 'PREMIUM', planExpiresAt: end });
    await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'SCALE', days: 30, amountRupees: 0, reference: 'comp' });
    const upd = db.jobBoardEmployer.update.mock.calls[0][0];
    expect(Math.round((upd.data.planExpiresAt.getTime() - Date.now()) / DAY)).toBe(40);
    expect(upd.data.maxActiveJobs).toBe(40);
  });

  it('Growth has no featured placement; a 365-day grant is a yearly plan', async () => {
    const { grantPlanAction } = await import('@/app/(dashboard)/plans/actions');
    asRole('SUPER_ADMIN');
    db.jobBoardEmployer.findUnique.mockResolvedValue({ companyName: 'Acme', plan: 'FREE', planExpiresAt: null });
    await grantPlanAction({ kind: 'EMPLOYER', id: 'e1', plan: 'GROWTH', days: 365, amountRupees: 29488, reference: 'NEFT-1' });
    const upd = db.jobBoardEmployer.update.mock.calls[0][0];
    expect(upd.data.planCycle).toBe('ANNUAL');
    expect(db.jobBoardListing.updateMany).not.toHaveBeenCalled();
    expect(db.jobBoardPayment.create.mock.calls[0][0].data.cycle).toBe('ANNUAL');
  });

  it('host Pro: features upcoming events until they end or the plan does, never shortening a Boost', async () => {
    const { grantPlanAction } = await import('@/app/(dashboard)/plans/actions');
    asRole('SUPER_ADMIN');
    db.eventOrganizer.findUnique.mockResolvedValue({ name: 'Host', plan: 'FREE', planExpiresAt: null });
    const soon = new Date(Date.now() + 5 * DAY);
    const late = new Date(Date.now() + 90 * DAY);
    const boosted = new Date(Date.now() + 100 * DAY);
    db.event.findMany.mockResolvedValue([
      { id: 'soon', endAt: soon, featuredUntil: null },
      { id: 'late', endAt: late, featuredUntil: null },
      { id: 'boosted', endAt: late, featuredUntil: boosted },
    ]);
    const r = await grantPlanAction({ kind: 'HOST', id: 'o1', plan: 'PRO', days: 30, amountRupees: 2358.82, reference: 'UPI-77' });
    expect(r.success).toBe(true);
    const byId = Object.fromEntries(db.event.update.mock.calls.map((c: any) => [c[0].where.id, c[0].data.featuredUntil.getTime()]));
    expect(byId.soon).toBe(soon.getTime());
    expect(Math.round((byId.late - Date.now()) / DAY)).toBe(33); // 30-day plan + 3 grace days
    expect(byId.boosted).toBe(boosted.getTime());
    expect(db.organizerPayment.create.mock.calls[0][0].data.kind).toBe('PRO');
  });

  it('ending a host plan keeps Boost placement but stops Pro placement', async () => {
    const { endPlanAction } = await import('@/app/(dashboard)/plans/actions');
    asRole('SUPER_ADMIN');
    await endPlanAction({ kind: 'HOST', id: 'o1' });
    expect(db.eventOrganizer.update.mock.calls[0][0].data.plan).toBe('FREE');
    expect(db.event.updateMany.mock.calls[0][0].where.boostedAt).toBeNull();
  });
});

describe('Job moderation (reports)', () => {
  const put = async (body: any) => {
    const { PUT } = await import('@/app/api/admin/reports/[id]/route');
    const req = new NextRequest('http://localhost/api/admin/reports/r1', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    return PUT(req, { params: Promise.resolve({ id: 'r1' }) });
  };

  it('requires an editor or super admin', async () => {
    asRole(null);
    expect((await put({ jobAction: 'close' })).status).toBe(401);
    asRole('WRITER');
    expect((await put({ jobAction: 'close' })).status).toBe(401);
  });

  it('rejects job actions on non-job reports', async () => {
    asRole('SUPER_ADMIN');
    db.contentReport.findUnique.mockResolvedValue({ id: 'r1', entityType: 'STARTUP', entityId: 's1' });
    expect((await put({ jobAction: 'close' })).status).toBe(400);
  });

  it('close: closes the job, resolves all open reports, emails owner and publisher once each with the reason', async () => {
    asRole('EDITOR_IN_CHIEF');
    db.contentReport.findUnique.mockResolvedValue({ id: 'r1', entityType: 'JOB', entityId: 'job1' });
    db.jobBoardListing.update.mockResolvedValue({ title: 'Backend Engineer', publishedByEmail: 'hr@acme.dev', Employer: { email: 'owner@acme.dev', passwordHash: 'x' } });
    const res = await put({ jobAction: 'close', adminNotes: 'Asked candidates for a fee' });
    expect(res.status).toBe(200);
    const upd = db.jobBoardListing.update.mock.calls[0][0];
    expect(upd.data).toMatchObject({ status: 'CLOSED', isActive: false, moderationHold: false });
    expect(db.contentReport.updateMany.mock.calls[0][0].data.status).toBe('RESOLVED');
    expect(sendEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(['hr@acme.dev', 'owner@acme.dev']);
    expect(sendEmail.mock.calls[0][0].html).toContain('Asked candidates for a fee');
  });

  it('close: no email for admin placeholder workspaces, and no duplicate when owner published it', async () => {
    asRole('SUPER_ADMIN');
    db.contentReport.findUnique.mockResolvedValue({ id: 'r1', entityType: 'JOB', entityId: 'job1' });
    db.jobBoardListing.update.mockResolvedValue({ title: 'Role', publishedByEmail: null, Employer: { email: 'placeholder@udyaibase.com', passwordHash: '' } });
    await put({ jobAction: 'close' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('release: lifts the hold, shows the job again only if it is still open, dismisses reports', async () => {
    asRole('SUPER_ADMIN');
    db.contentReport.findUnique.mockResolvedValue({ id: 'r1', entityType: 'JOB', entityId: 'job1' });
    db.jobBoardListing.findUnique.mockResolvedValue({ status: 'PAUSED' });
    await put({ jobAction: 'release' });
    expect(db.jobBoardListing.update.mock.calls[0][0].data).toMatchObject({ moderationHold: false, isActive: false });
    expect(db.contentReport.updateMany.mock.calls[0][0].data.status).toBe('DISMISSED');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

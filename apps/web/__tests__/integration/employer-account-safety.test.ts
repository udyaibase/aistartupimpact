import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
  const tx = {
    newsletterSubscriber: { updateMany: vi.fn() },
    jobBoardEmployer: { delete: vi.fn(), update: vi.fn() },
    jobBoardListing: { deleteMany: vi.fn(), updateMany: vi.fn() },
    jobBoardCareersWidget: { deleteMany: vi.fn() },
    jobBoardTeamMember: { deleteMany: vi.fn() },
    jobBoardAiScreening: { deleteMany: vi.fn() },
    jobBoardPayment: { deleteMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      jobBoardEmployer: { findUnique: vi.fn(), update: vi.fn() },
      jobBoardApplication: { findMany: vi.fn() },
      jobBoardPayment: { count: vi.fn() },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    session: vi.fn(),
    clear: vi.fn(),
    check: vi.fn(),
    deleteResume: vi.fn(),
  };
});

vi.mock('@udyaibase/database', () => ({ prisma: db.prisma }));
vi.mock('@/lib/employer-auth', () => ({
  requireEmployerAuth: async () => {
    const s = db.session();
    if (!s) throw new Error('EMPLOYER_AUTH_REQUIRED');
    return s;
  },
  clearEmployerSession: db.clear,
  sessionCutoff: () => new Date(0),
}));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: async () => null }));
vi.mock('@/lib/employer/account-action', () => ({ checkActionCode: db.check }));
vi.mock('@/lib/jobs/resume-storage', () => ({ deleteResume: db.deleteResume }));
vi.mock('@/lib/revalidate', () => ({ refreshSections: vi.fn() }));

import { DELETE } from '@/app/api/employer/delete-account/route';
import { POST as deactivate } from '@/app/api/employer/deactivate/route';

const owner = { id: 'e1', email: 'owner@acme.ai', role: 'OWNER', memberId: null };
const req = (body: unknown, method = 'DELETE') => new NextRequest('http://t/api', { method, body: JSON.stringify(body) });

describe('deleting a workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.session.mockReturnValue(owner);
    db.check.mockResolvedValue({ ok: true });
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue({ id: 'e1', email: 'owner@acme.ai', deactivatedAt: null });
    db.prisma.jobBoardApplication.findMany.mockResolvedValue([{ resumeKey: 'r/1.pdf' }]);
    db.prisma.jobBoardPayment.count.mockResolvedValue(0);
    db.deleteResume.mockResolvedValue(undefined);
  });

  it('works without a password, for passwordless accounts', async () => {
    const res = await DELETE(req({ code: '123456' }));
    expect(res.status).toBe(200);
    expect(db.check).toHaveBeenCalledWith('owner@acme.ai', '123456');
    expect(db.tx.jobBoardEmployer.delete).toHaveBeenCalled();
  });

  it('checks the code of whoever is signed in, and stops on a wrong one', async () => {
    db.check.mockResolvedValue({ ok: false, status: 400, error: 'Invalid code.' });
    const res = await DELETE(req({ code: '000000' }));
    expect(res.status).toBe(400);
    expect(db.tx.jobBoardEmployer.delete).not.toHaveBeenCalled();
    expect(db.clear).not.toHaveBeenCalled();
  });

  it('refuses a teammate who isn’t an owner', async () => {
    db.session.mockReturnValue({ ...owner, role: 'RECRUITER', memberId: 'm1' });
    const res = await DELETE(req({ code: '123456' }));
    expect(res.status).toBe(403);
    expect(db.check).not.toHaveBeenCalled();
  });

  it('removes resumes from storage', async () => {
    await DELETE(req({ code: '123456' }));
    expect(db.deleteResume).toHaveBeenCalledWith('r/1.pdf');
  });

  it('keeps invoices: empties the workspace instead of deleting the row they hang from', async () => {
    db.prisma.jobBoardPayment.count.mockResolvedValue(2);
    const res = await DELETE(req({ code: '123456' }));
    expect(res.status).toBe(200);
    expect(db.tx.jobBoardEmployer.delete).not.toHaveBeenCalled();
    expect(db.tx.jobBoardListing.deleteMany).toHaveBeenCalledWith({ where: { employerId: 'e1' } });
    const data = db.tx.jobBoardEmployer.update.mock.calls[0][0].data;
    expect(data.email).toBe('deleted-e1@deleted.invalid');
    expect(data.companyName).toBe('Deleted workspace');
    expect(data.isActive).toBe(false);
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.billingGstin).toBeNull();
    expect(data.twoFactorSecret).toBeNull();
    const removed = db.tx.jobBoardPayment.deleteMany.mock.calls[0][0].where;
    expect(removed).toMatchObject({ invoiceNumber: null, NOT: { status: 'SUCCESS' } });
  });
});

describe('deactivating a workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.session.mockReturnValue(owner);
    db.check.mockResolvedValue({ ok: true });
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue({ deactivatedAt: null });
  });

  it('works with a code, pauses jobs, and sets the session cut-off', async () => {
    const res = await deactivate(req({ code: '123456' }, 'POST'));
    expect(res.status).toBe(200);
    expect(db.tx.jobBoardEmployer.update.mock.calls[0][0].data.sessionsValidAfter).toEqual(new Date(0));
    expect(db.tx.jobBoardListing.updateMany).toHaveBeenCalled();
  });

  it('stops on a wrong code', async () => {
    db.check.mockResolvedValue({ ok: false, status: 400, error: 'Invalid code.' });
    const res = await deactivate(req({ code: '1' }, 'POST'));
    expect(res.status).toBe(400);
    expect(db.tx.jobBoardEmployer.update).not.toHaveBeenCalled();
  });
});

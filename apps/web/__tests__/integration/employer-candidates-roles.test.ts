import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/** Signed-in employer (or teammate) making the request. */
const who = vi.hoisted(() => ({ role: 'OWNER', jobIds: null as string[] | null }));
const db = vi.hoisted(() => ({
  jobBoardApplication: { findFirst: vi.fn(), update: vi.fn((a: unknown) => a), groupBy: vi.fn(async () => []) },
  jobBoardListing: { findFirst: vi.fn(), update: vi.fn((a: unknown) => a) },
  jobBoardApplicationNote: { create: vi.fn((a: unknown) => a) },
  jobBoardEmployer: { findUnique: vi.fn(async () => ({ FounderUser: { name: 'Asha' } })) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
const screen = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: async () => null }));
vi.mock('@/lib/jobs/ai-screen', () => ({ screenApplication: screen }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, after: (fn: () => unknown) => fn() };
});
// The session behind the one guard (employerApi); the role and job checks then run for real.
vi.mock('@/lib/employer-auth', () => ({
  getEmployerSession: async () => ({ id: 'emp1', email: 'hr@acme.co', role: who.role, jobIds: who.jobIds, memberName: null, memberId: null }),
}));

import { POST } from '@/app/api/employer/applications/[id]/job/route';
import { stageCountsByJob } from '@/lib/employer/job-stages';

const call = (listingId?: string) =>
  POST(new NextRequest('http://localhost/api/employer/applications/a1/job', { method: 'POST', body: JSON.stringify({ listingId }) }), { params: Promise.resolve({ id: 'a1' }) });
const generalApp = (over: Record<string, unknown> = {}) => db.jobBoardApplication.findFirst.mockResolvedValueOnce({
  id: 'a1', email: 'cand@x.co', listingId: 'gen', confirmedSkills: ['python', 'sql'], withdrawnAt: null, Listing: { isGeneral: true }, ...over,
});
const openJob = () => db.jobBoardListing.findFirst.mockResolvedValueOnce({ id: 'ml', title: 'ML Engineer', skills: ['Python'] });

beforeEach(() => { vi.clearAllMocks(); who.role = 'OWNER'; who.jobIds = null; });

describe('move a general application into a role', () => {
  it('moves it, recounts both listings, leaves a team note and reviews it against the role', async () => {
    generalApp(); openJob();
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(null); // not already applied there
    const res = await call('ml');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, job: { id: 'ml', title: 'ML Engineer' } });
    expect(db.jobBoardApplication.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { listingId: 'ml', matchedSkills: expect.any(Array) } });
    expect(db.jobBoardListing.update).toHaveBeenCalledWith({ where: { id: 'gen' }, data: { applicationsCount: { decrement: 1 } } });
    expect(db.jobBoardApplicationNote.create.mock.calls[0][0]).toMatchObject({ data: { body: 'Moved from General applications to ML Engineer.' } });
    expect(screen).toHaveBeenCalledWith('a1', 'emp1', { auto: true });
  });

  it('never moves someone who applied to a specific role', async () => {
    generalApp({ Listing: { isGeneral: false } });
    expect((await call('ml')).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses closed or other companies’ roles, and duplicates', async () => {
    generalApp();
    db.jobBoardListing.findFirst.mockResolvedValueOnce(null);
    expect((await call('closed-or-foreign')).status).toBe(400);
    expect(db.jobBoardListing.findFirst.mock.calls[0][0].where).toMatchObject({ employerId: 'emp1', isGeneral: false, status: { in: ['OPEN', 'PAUSED'] } });

    generalApp(); openJob();
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'a-existing' });
    const dup = await call('ml');
    expect(dup.status).toBe(409);
    expect((await dup.json()).existingId).toBe('a-existing');
  });

  it('interviewers can’t move candidates; job-limited teammates can’t pick roles outside their list', async () => {
    who.role = 'INTERVIEWER';
    expect((await call('ml')).status).toBe(403);
    who.role = 'RECRUITER'; who.jobIds = ['gen'];
    expect((await call('ml')).status).toBe(404);
  });

  it('withdrawn candidates stay where they are', async () => {
    generalApp({ withdrawnAt: new Date() });
    expect((await call('ml')).status).toBe(409);
  });
});

describe('stage counts per job', () => {
  it('groups statuses into board stages and counts unseen separately', async () => {
    db.jobBoardApplication.groupBy.mockResolvedValueOnce([
      { listingId: 'ml', status: 'APPLIED', _count: { _all: 12 } },
      { listingId: 'ml', status: 'REVIEWED', _count: { _all: 28 } },
      { listingId: 'ml', status: 'INTERVIEW', _count: { _all: 6 } },
      { listingId: 'ml', status: 'OFFER', _count: { _all: 1 } },
    ] as never);
    const c = await stageCountsByJob(['ml', 'design']);
    expect(c.ml).toMatchObject({ new: 40, unseen: 12, interview: 6, offer: 1, total: 47 });
    expect(c.design.total).toBe(0);
    const where = (db.jobBoardApplication.groupBy.mock.calls[0] as any)[0].where;
    expect(where).toMatchObject({ withdrawnAt: null, NOT: { email: { endsWith: '@deleted.invalid' } } });
  });
});

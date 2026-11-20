import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardListing: { findMany: vi.fn(), findUnique: vi.fn(async () => ({ slug: 'engineer' })) },
  jobBoardApplication: { groupBy: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  jobBoardApplicationEvent: { create: vi.fn(async () => ({ id: 'ev1' })), update: vi.fn() },
  jobBoardAssessment: { updateMany: vi.fn(async () => ({ count: 0 })) },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => ({ sendEmailBatch: vi.fn(async () => []) }));
const status = vi.hoisted(() => vi.fn(async () => 1));
vi.mock('@/lib/jobs/listing-status', () => ({ setListingStatus: status }));
vi.mock('@/lib/revalidate', () => ({ refreshSections: vi.fn(), refreshPaths: vi.fn() }));

import { cleanPositions, draftFromRow, draftToData, emptyDraft } from '@/lib/jobs/composer';
import { newlyFilledJobs } from '@/lib/employer/job-stages';
import { moveApplications } from '@/lib/employer/pipeline';

beforeEach(() => vi.clearAllMocks());

describe('openings on the job form', () => {
  it('defaults to one and keeps whole numbers between 1 and 500', () => {
    expect(emptyDraft().positions).toBe('1');
    expect(cleanPositions('5')).toBe(5);
    expect(cleanPositions('0')).toBe(1);
    expect(cleanPositions('')).toBe(1);
    expect(cleanPositions('abc')).toBe(1);
    expect(cleanPositions('9999')).toBe(500);
  });
  it('saves and loads back the same number; older jobs without it read as 1', () => {
    expect(draftToData({ ...emptyDraft(), positions: '5' }).positions).toBe(5);
    expect(draftFromRow({ positions: 5 }).positions).toBe('5');
    expect(draftFromRow({}).positions).toBe('1');
  });
});

describe('filled positions', () => {
  it('a job is filled when its openings have joined (awaiting joining reserves, but doesn’t fill)', async () => {
    db.jobBoardListing.findMany.mockResolvedValue([
      { id: 'a', title: 'Designer', positions: 5 },
      { id: 'b', title: 'Engineer', positions: 2 },
    ]);
    db.jobBoardApplication.findMany.mockResolvedValue([
      { listingId: 'a', joinedAt: new Date() }, { listingId: 'a', joinedAt: null }, { listingId: 'a', joinedAt: null },
      { listingId: 'b', joinedAt: new Date() }, { listingId: 'b', joinedAt: new Date() },
    ]);
    expect(await newlyFilledJobs(['a', 'b', 'b'])).toEqual([{ id: 'b', title: 'Engineer', positions: 2, hired: 2 }]);
    const where = db.jobBoardListing.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['OPEN', 'PAUSED'] });
    expect(where.isGeneral).toBe(false);
    // Hires count even if the person's data was later erased; withdrawn hires don't.
    expect(db.jobBoardApplication.findMany.mock.calls[0][0].where).toEqual({ listingId: { in: ['a', 'b'] }, status: 'HIRED', withdrawnAt: null });
  });

  it('marking someone joined closes a now-filled job (no emails); accepting alone or other moves never do', async () => {
    const app = { id: 'x', status: 'OFFER', fullName: 'Asha Rao', email: 'a@x.com', withdrawnAt: null, firstResponseAt: null, reviewedAt: null, listingId: 'b', sourcedState: null, holdFromStatus: null, Listing: { title: 'Engineer', interviewRounds: [], assessment: null } };
    const base = { employerId: 'e', actorEmail: 'hr@x.com', company: 'X', ids: ['x'], batchKey: 'k' };

    db.jobBoardApplication.findMany.mockResolvedValueOnce([app]);
    const accepted = await moveApplications({ ...base, toStatus: 'HIRED' });
    expect(accepted.filledJobs).toBeUndefined();
    expect(db.jobBoardApplication.update.mock.calls[0][0].data).toMatchObject({ status: 'HIRED', joinedAt: null });
    // An assessment they never handed in is closed once they're hired.
    expect(db.jobBoardAssessment.updateMany).toHaveBeenCalledWith({ where: { applicationId: 'x', status: 'SENT' }, data: { status: 'CANCELLED' } });

    db.jobBoardApplication.findMany.mockResolvedValueOnce([app]).mockResolvedValueOnce([{ listingId: 'b', joinedAt: new Date() }]);
    db.jobBoardListing.findMany.mockResolvedValue([{ id: 'b', title: 'Engineer', positions: 1 }]);
    const joined = await moveApplications({ ...base, toStatus: 'HIRED', joined: true, batchKey: 'k2' });
    expect(joined.filledJobs).toEqual([{ id: 'b', title: 'Engineer', positions: 1, hired: 1, closed: true }]);
    expect(status).toHaveBeenCalledWith('b', 'CLOSED', 'FILLED');

    db.jobBoardListing.findMany.mockClear();
    db.jobBoardApplication.findMany.mockResolvedValueOnce([app]);
    db.jobBoardAssessment.updateMany.mockClear();
    const moved = await moveApplications({ ...base, toStatus: 'INTERVIEW', batchKey: 'k3' });
    expect(moved.filledJobs).toBeUndefined();
    expect(db.jobBoardAssessment.updateMany).not.toHaveBeenCalled();

    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ ...app, status: 'ASSESSMENT' }]);
    await moveApplications({ ...base, toStatus: 'REJECTED', batchKey: 'k4' });
    expect(db.jobBoardAssessment.updateMany).toHaveBeenCalledWith({ where: { applicationId: 'x', status: 'SENT' }, data: { status: 'CANCELLED' } });
    expect(db.jobBoardListing.findMany).not.toHaveBeenCalled();
  });
});

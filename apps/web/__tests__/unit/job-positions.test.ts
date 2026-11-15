import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardListing: { findMany: vi.fn() },
  jobBoardApplication: { groupBy: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  jobBoardApplicationEvent: { create: vi.fn(async () => ({ id: 'ev1' })), update: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => ({ sendEmailBatch: vi.fn(async () => []) }));

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
  it('offers to close only open jobs whose hires reached the openings', async () => {
    db.jobBoardListing.findMany.mockResolvedValue([
      { id: 'a', title: 'Designer', positions: 5 },
      { id: 'b', title: 'Engineer', positions: 2 },
    ]);
    db.jobBoardApplication.groupBy.mockResolvedValue([{ listingId: 'a', _count: { _all: 3 } }, { listingId: 'b', _count: { _all: 2 } }]);
    expect(await newlyFilledJobs(['a', 'b', 'b'])).toEqual([{ id: 'b', title: 'Engineer', positions: 2, hired: 2 }]);
    const where = db.jobBoardListing.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['OPEN', 'PAUSED'] });
    expect(where.isGeneral).toBe(false);
    // Hires count even if the person's data was later erased; withdrawn hires don't.
    expect(db.jobBoardApplication.groupBy.mock.calls[0][0].where).toEqual({ listingId: { in: ['a', 'b'] }, status: 'HIRED', withdrawnAt: null });
  });

  it('a move to Hired reports the filled job; other moves never check', async () => {
    const app = { id: 'x', status: 'OFFER', fullName: 'Asha Rao', email: 'a@x.com', withdrawnAt: null, firstResponseAt: null, reviewedAt: null, listingId: 'b', Listing: { title: 'Engineer' } };
    db.jobBoardApplication.findMany.mockResolvedValue([app]);
    db.jobBoardListing.findMany.mockResolvedValue([{ id: 'b', title: 'Engineer', positions: 1 }]);
    db.jobBoardApplication.groupBy.mockResolvedValue([{ listingId: 'b', _count: { _all: 1 } }]);
    const base = { employerId: 'e', actorEmail: 'hr@x.com', company: 'X', ids: ['x'], batchKey: 'k' };
    const hired = await moveApplications({ ...base, toStatus: 'HIRED' });
    expect(hired.filledJobs).toEqual([{ id: 'b', title: 'Engineer', positions: 1, hired: 1 }]);

    db.jobBoardListing.findMany.mockClear();
    const moved = await moveApplications({ ...base, toStatus: 'INTERVIEW' });
    expect(moved.filledJobs).toBeUndefined();
    expect(db.jobBoardListing.findMany).not.toHaveBeenCalled();
  });
});

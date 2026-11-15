import { prisma } from '@udyaibase/database';
import { stageOf, type StageKey } from '@/lib/employer/pipeline';

export type StageCounts = Record<StageKey, number> & { total: number; unseen: number };

const empty = (): StageCounts => ({ new: 0, shortlisted: 0, interview: 0, offer: 0, hired: 0, rejected: 0, total: 0, unseen: 0 });

/**
 * Candidates per pipeline stage for each job, for the Jobs list and the Candidates role tabs.
 * Withdrawn candidates and erased (deleted-account) applications aren't counted.
 */
export async function stageCountsByJob(listingIds: string[]): Promise<Record<string, StageCounts>> {
  const out: Record<string, StageCounts> = {};
  for (const id of listingIds) out[id] = empty();
  if (!listingIds.length) return out;
  const rows = await prisma.jobBoardApplication.groupBy({
    by: ['listingId', 'status'],
    where: { listingId: { in: listingIds }, withdrawnAt: null, NOT: { email: { endsWith: '@deleted.invalid' } } },
    _count: { _all: true },
  });
  for (const r of rows) {
    const c = out[r.listingId] ?? (out[r.listingId] = empty());
    const n = r._count._all;
    c[stageOf(r.status)] += n;
    c.total += n;
    if (r.status === 'APPLIED') c.unseen += n;
  }
  return out;
}

/**
 * Positions filled per job: candidates moved to Hired who haven't withdrawn. Unlike the stage counts, people whose
 * data was later erased still count, because the seat was filled.
 */
export async function hiresByJob(listingIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of listingIds) out[id] = 0;
  if (!listingIds.length) return out;
  const rows = await prisma.jobBoardApplication.groupBy({
    by: ['listingId'],
    where: { listingId: { in: listingIds }, status: 'HIRED', withdrawnAt: null },
    _count: { _all: true },
  });
  for (const r of rows) out[r.listingId] = r._count._all;
  return out;
}

export interface FilledJob { id: string; title: string; positions: number; hired: number }

/** Of these jobs, the open or paused ones whose every position is now filled (to offer closing them). */
export async function newlyFilledJobs(listingIds: string[]): Promise<FilledJob[]> {
  const ids = Array.from(new Set(listingIds));
  if (!ids.length) return [];
  const [jobs, hires] = await Promise.all([
    prisma.jobBoardListing.findMany({
      where: { id: { in: ids }, isGeneral: false, deletedAt: null, status: { in: ['OPEN', 'PAUSED'] } },
      select: { id: true, title: true, positions: true },
    }),
    hiresByJob(ids),
  ]);
  return jobs.filter((j) => (hires[j.id] ?? 0) >= j.positions).map((j) => ({ ...j, hired: hires[j.id] ?? 0 }));
}

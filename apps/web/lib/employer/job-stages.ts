import { prisma } from '@udyaibase/database';
import { stageOf, type StageKey } from '@/lib/employer/pipeline';
import { IN_PIPELINE } from '@/lib/employer/stages';
import { setListingStatus } from '@/lib/jobs/listing-status';
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { logEmployerActivity } from '@/lib/workspace-activity';

export type StageCounts = Record<StageKey, number> & { total: number; unseen: number };

const empty = (): StageCounts => ({ new: 0, shortlisted: 0, assessment: 0, interview: 0, decision: 0, offer: 0, hired: 0, rejected: 0, onhold: 0, total: 0, unseen: 0 });

/**
 * Candidates per pipeline stage for each job, for the Jobs list and the Candidates role tabs.
 * Withdrawn candidates, erased (deleted-account) applications and sourced people who aren't interested yet aren't counted.
 */
export async function stageCountsByJob(listingIds: string[]): Promise<Record<string, StageCounts>> {
  const out: Record<string, StageCounts> = {};
  for (const id of listingIds) out[id] = empty();
  if (!listingIds.length) return out;
  const rows = await prisma.jobBoardApplication.groupBy({
    by: ['listingId', 'status'],
    where: { listingId: { in: listingIds }, withdrawnAt: null, NOT: { email: { endsWith: '@deleted.invalid' } }, ...IN_PIPELINE },
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

/** A job's openings: who has joined, who accepted and is awaiting joining, and how many are still free to offer. */
export interface Openings { positions: number; joined: number; awaiting: number; available: number }

export function openingsOf(positions: number, joined: number, awaiting: number): Openings {
  return { positions, joined, awaiting, available: Math.max(0, positions - joined - awaiting) };
}

/**
 * Joined and awaiting-joining hires per job. People whose data was later erased still count, because the seat is taken.
 * "Hired" (the old meaning) is joined + awaiting.
 */
export async function hiresByJob(listingIds: string[]): Promise<Record<string, { joined: number; awaiting: number }>> {
  const out: Record<string, { joined: number; awaiting: number }> = {};
  for (const id of listingIds) out[id] = { joined: 0, awaiting: 0 };
  if (!listingIds.length) return out;
  const rows = await prisma.jobBoardApplication.findMany({
    where: { listingId: { in: listingIds }, status: 'HIRED', withdrawnAt: null },
    select: { listingId: true, joinedAt: true },
  });
  for (const r of rows) (out[r.listingId] ??= { joined: 0, awaiting: 0 })[r.joinedAt ? 'joined' : 'awaiting']++;
  return out;
}

export interface FilledJob { id: string; title: string; positions: number; hired: number; closed?: boolean }

/** Of these jobs, the open or paused ones whose every opening has now joined. */
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
  return jobs.filter((j) => (hires[j.id]?.joined ?? 0) >= j.positions).map((j) => ({ ...j, hired: hires[j.id]?.joined ?? 0 }));
}

/**
 * The last opening joined: the job is marked filled and stops taking applications straight away. Nobody is emailed
 * here; the team sees how many are still waiting and chooses whether to send the closing email.
 */
export async function closeFilledJobs(listingIds: string[], actorEmail: string): Promise<FilledJob[]> {
  const filled = await newlyFilledJobs(listingIds);
  for (const j of filled) {
    await setListingStatus(j.id, 'CLOSED', 'FILLED');
    const l = await prisma.jobBoardListing.findUnique({ where: { id: j.id }, select: { slug: true, employerId: true } });
    if (l) {
      refreshSections(['jobs', 'home']); refreshPaths([`/jobs/${l.slug}`]);
      // Nobody pressed "close": the last hire joining did it. The log says so, and who recorded that hire.
      await logEmployerActivity(l.employerId, 'job_status_changed', { actor: { name: null, email: actorEmail }, metadata: { title: j.title, status: 'CLOSED', reason: 'filled' } }).catch(() => {});
    }
  }
  return filled.map((j) => ({ ...j, closed: true }));
}

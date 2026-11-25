import { prisma } from '@udyaibase/database';
import { IN_PIPELINE } from '@/lib/employer/stages';

/**
 * The counts the hiring portal shows about candidates who need attention, defined once.
 *
 * Every screen (home, sidebar, candidates board, jobs, insights, weekly report) must take these numbers from here and
 * use these words for them. They used to be worked out separately on each screen, so "new" meant "nobody opened it"
 * in one place and "still in the New stage" in another, and the same workspace showed 20, 29, 42 and 70.
 *
 *   unseen    Nobody on the team has opened the application yet (status APPLIED).            Label: "unseen"
 *   toReview  Still in the New stage: unseen, or opened but not moved or turned down.         Label: "to review" / "New"
 *   overdue   In the New stage and applied more than OVERDUE_DAYS days ago.                   Label: "waiting more than 5 days"
 *
 * All three leave out candidates who withdrew, people the team sourced who haven't said they're interested,
 * erased applications and deleted jobs, the same as the candidates board. Closed jobs count: those candidates
 * are still owed an answer.
 */

export const OVERDUE_DAYS = 5;
const DAY = 864e5;

/** Applications that count at all, for a workspace (or for the jobs an interviewer is limited to). */
function countable(employerId: string, jobIds: string[] | null = null) {
  return {
    withdrawnAt: null,
    ...IN_PIPELINE,
    NOT: { email: { endsWith: '@deleted.invalid' } },
    Listing: { employerId, deletedAt: null, ...(jobIds ? { id: { in: jobIds } } : {}) },
  };
}

export const unseenWhere = (employerId: string, jobIds: string[] | null = null) =>
  ({ ...countable(employerId, jobIds), status: 'APPLIED' as const });

export const toReviewWhere = (employerId: string, jobIds: string[] | null = null) =>
  ({ ...countable(employerId, jobIds), status: { in: ['APPLIED' as const, 'REVIEWED' as const] } });

export const overdueWhere = (employerId: string, jobIds: string[] | null = null, now = Date.now()) =>
  ({ ...toReviewWhere(employerId, jobIds), appliedAt: { lt: new Date(now - OVERDUE_DAYS * DAY) } });

export interface ReviewCounts { unseen: number; toReview: number; overdue: number }

export async function reviewCounts(employerId: string, jobIds: string[] | null = null, now = Date.now()): Promise<ReviewCounts> {
  const [unseen, toReview, overdue] = await Promise.all([
    prisma.jobBoardApplication.count({ where: unseenWhere(employerId, jobIds) }),
    prisma.jobBoardApplication.count({ where: toReviewWhere(employerId, jobIds) }),
    prisma.jobBoardApplication.count({ where: overdueWhere(employerId, jobIds, now) }),
  ]);
  return { unseen, toReview, overdue };
}

/** "To review" per job, for tables that list jobs. */
export async function toReviewByJob(employerId: string): Promise<Record<string, number>> {
  const rows = await prisma.jobBoardApplication.groupBy({ by: ['listingId'], where: toReviewWhere(employerId), _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.listingId, r._count._all]));
}

/**
 * Seats in use: everyone on the team or invited. The workspace owner has a team row of their own; older workspaces
 * whose owner has none yet still take one seat. (Adding one for the owner on top of their own row counted them twice.)
 */
export async function seatsUsed(employerId: string): Promise<number> {
  const [members, account] = await Promise.all([
    prisma.jobBoardTeamMember.findMany({ where: { employerId, status: { in: ['PENDING', 'ACTIVE'] } }, select: { email: true } }),
    prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { email: true } }),
  ]);
  const ownerHasRow = !!account && members.some((m) => m.email.toLowerCase() === account.email.toLowerCase());
  return members.length + (ownerHasRow ? 0 : 1);
}

/**
 * Jobs that use up the plan's open-job allowance: open and not past their closing date. A job past its date shows as
 * Closed on the Jobs page before the nightly job updates its status, so it mustn't block publishing another one.
 * The hidden "General application" listing is always closed, so it never counts.
 */
export function openJobsWhere(employerId: string, now = new Date()) {
  return { employerId, status: 'OPEN' as const, deletedAt: null, isGeneral: false, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export function countOpenJobs(employerId: string, now = new Date()) {
  return prisma.jobBoardListing.count({ where: openJobsWhere(employerId, now) });
}

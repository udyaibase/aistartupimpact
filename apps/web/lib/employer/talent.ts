import { prisma } from '@udyaibase/database';
import { publicListingWhere } from '@/lib/jobs/public';
import { POOL_REMINDER_DAYS } from '@/lib/jobs/talent-pool';

export interface PoolCandidate {
  /** Their latest application in the pool: invites, tags and notes go through it. */
  id: string;
  fullName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  city: string | null;
  experienceYears: number | null;
  skills: string[];
  appliedFor: string;
  appliedAt: string;
  /** The furthest they got in any of their applications, e.g. "Interviewed, not selected". */
  furthestStage: string;
  furthestRank: number;
  poolUntil: string;
  expiringSoon: boolean;
  invitedTo: string[];
  appliedTo: string[];
  tags: string[];
  noteCount: number;
  lastNote: { authorName: string; body: string; createdAt: string } | null;
}

export interface TalentPoolData {
  people: PoolCandidate[];
  /** Pool members not listed because you've hired them. */
  hiredHidden: number;
}

/** The most pool rows one page loads (newest first). */
export const POOL_LIMIT = 3000;
const DAY = 864e5;

// Furthest stage reached, in the board's order (Assessment and Final decision included).
const RANK: Record<string, number> = { APPLIED: 0, REVIEWED: 0, SHORTLISTED: 1, ASSESSMENT: 2, INTERVIEW: 3, DECISION: 4, OFFER: 5 };
const LABEL = ['Applied', 'Screened', 'Took the assessment', 'Interviewed', 'Reached the final decision', 'Got an offer'];

/**
 * Candidates who opted in to hear about other roles. One entry per person, however many roles they applied to.
 * People you've hired are left out: they work for you now.
 */
export async function loadTalentPool(employerId: string, now = new Date()): Promise<TalentPoolData> {
  const rows = await prisma.jobBoardApplication.findMany({
    where: { Listing: { employerId }, talentPoolUntil: { gt: now }, NOT: { email: { endsWith: '@deleted.invalid' } } },
    orderBy: { appliedAt: 'desc' },
    take: POOL_LIMIT,
    select: {
      id: true, email: true, fullName: true, currentTitle: true, currentCompany: true, city: true, experienceYears: true,
      confirmedSkills: true, appliedAt: true, status: true, talentPoolUntil: true, talentTags: true,
      Listing: { select: { title: true, isGeneral: true } },
      TalentInvites: { select: { listingId: true } },
    },
  });
  if (!rows.length) return { people: [], hiredHidden: 0 };

  const emails = Array.from(new Set(rows.map((r) => r.email)));
  const [all, events, notes] = await Promise.all([
    // Every application these people sent you (in or out of the pool): what they applied to, and who you hired.
    prisma.jobBoardApplication.findMany({
      where: { Listing: { employerId }, email: { in: emails, mode: 'insensitive' } },
      select: { email: true, listingId: true, status: true, withdrawnAt: true },
    }),
    // Stages they reached before a later rejection ("Interviewed, not selected").
    prisma.jobBoardApplicationEvent.findMany({
      where: { applicationId: { in: rows.map((r) => r.id) }, toStatus: { in: ['SHORTLISTED', 'INTERVIEW', 'OFFER'] } },
      select: { applicationId: true, toStatus: true },
    }),
    prisma.jobBoardApplicationNote.findMany({
      where: { applicationId: { in: rows.map((r) => r.id) } },
      orderBy: { createdAt: 'desc' },
      select: { applicationId: true, authorName: true, body: true, createdAt: true },
    }),
  ]);

  const hiredEmails = new Set(all.filter((a) => a.status === 'HIRED' && !a.withdrawnAt).map((a) => a.email.toLowerCase()));
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.email.toLowerCase();
    byPerson.set(key, [...(byPerson.get(key) ?? []), r]);
  }

  const people: PoolCandidate[] = [];
  let hiredHidden = 0;
  for (const [key, mine] of byPerson) {
    if (hiredEmails.has(key)) { hiredHidden++; continue; }
    const latest = mine[0];
    const ids = new Set(mine.map((m) => m.id));
    let rank = -1;
    let rejected = false;
    for (const m of mine) {
      if (m.status === 'REJECTED') rejected = true;
      rank = Math.max(rank, RANK[m.status] ?? -1);
    }
    for (const e of events) if (ids.has(e.applicationId)) rank = Math.max(rank, RANK[e.toStatus] ?? -1);
    const anyActive = mine.some((m) => m.status !== 'REJECTED');
    const furthestStage = rank < 0 ? 'Not selected' : !anyActive && rejected ? `${LABEL[rank]}, not selected` : LABEL[rank];
    const myNotes = notes.filter((n) => ids.has(n.applicationId));
    const until = mine.reduce((d, m) => (m.talentPoolUntil! > d ? m.talentPoolUntil! : d), latest.talentPoolUntil!);
    people.push({
      id: latest.id,
      fullName: latest.fullName,
      currentTitle: latest.currentTitle,
      currentCompany: latest.currentCompany,
      city: latest.city,
      experienceYears: latest.experienceYears,
      skills: Array.from(new Set(mine.flatMap((m) => m.confirmedSkills))),
      appliedFor: latest.Listing.isGeneral ? 'General application' : latest.Listing.title,
      appliedAt: latest.appliedAt.toISOString(),
      furthestStage,
      furthestRank: rank,
      poolUntil: until.toISOString(),
      expiringSoon: until.getTime() - now.getTime() <= POOL_REMINDER_DAYS * DAY,
      invitedTo: mine.flatMap((m) => m.TalentInvites.map((i) => i.listingId)),
      appliedTo: all.filter((a) => a.email.toLowerCase() === key).map((a) => a.listingId),
      tags: Array.from(new Set(mine.flatMap((m) => m.talentTags))),
      noteCount: myNotes.length,
      lastNote: myNotes[0] ? { authorName: myNotes[0].authorName, body: myNotes[0].body.slice(0, 280), createdAt: myNotes[0].createdAt.toISOString() } : null,
    });
  }
  return { people, hiredHidden };
}

/** Open, public jobs a pool candidate can be invited to, with what's needed to rank the pool against each one. */
export function openJobsFor(employerId: string) {
  return prisma.jobBoardListing.findMany({
    where: { employerId, ...publicListingWhere(), applicationType: { not: 'EXTERNAL' } },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, title: true, slug: true, skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true },
  });
}

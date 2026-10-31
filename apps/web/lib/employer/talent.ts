import { prisma } from '@udyaibase/database';
import { publicListingWhere } from '@/lib/jobs/public';

export interface PoolCandidate {
  id: string;
  fullName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  city: string | null;
  experienceYears: number | null;
  skills: string[];
  appliedFor: string;
  appliedAt: string;
  furthestStage: string;
  poolUntil: string;
  invitedTo: string[];
  appliedTo: string[];
}

const STAGE: Record<string, string> = { APPLIED: 'Applied', REVIEWED: 'Applied', SHORTLISTED: 'Shortlisted', INTERVIEW: 'Interviewed', OFFER: 'Got an offer', HIRED: 'Hired', REJECTED: 'Not selected' };

/** Candidates who opted in to hear about other roles. One entry per person (their latest application). */
export async function loadTalentPool(employerId: string): Promise<PoolCandidate[]> {
  const rows = await prisma.jobBoardApplication.findMany({
    where: { Listing: { employerId }, talentPoolUntil: { gt: new Date() }, NOT: { email: { endsWith: '@deleted.invalid' } } },
    orderBy: { appliedAt: 'desc' },
    take: 2000,
    select: {
      id: true, email: true, fullName: true, currentTitle: true, currentCompany: true, city: true, experienceYears: true,
      confirmedSkills: true, appliedAt: true, status: true, talentPoolUntil: true,
      Listing: { select: { title: true } },
      TalentInvites: { select: { listingId: true } },
    },
  });
  // Every job this person already applied to, so the UI doesn't offer those.
  const emails = Array.from(new Set(rows.map((r) => r.email.toLowerCase())));
  const applied = emails.length
    ? await prisma.jobBoardApplication.findMany({ where: { Listing: { employerId }, email: { in: rows.map((r) => r.email) } }, select: { email: true, listingId: true } })
    : [];
  const seen = new Set<string>();
  const out: PoolCandidate[] = [];
  for (const r of rows) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.id, fullName: r.fullName, currentTitle: r.currentTitle, currentCompany: r.currentCompany, city: r.city,
      experienceYears: r.experienceYears, skills: r.confirmedSkills, appliedFor: r.Listing.title, appliedAt: r.appliedAt.toISOString(),
      furthestStage: STAGE[r.status] ?? r.status, poolUntil: r.talentPoolUntil!.toISOString(),
      invitedTo: rows.filter((x) => x.email.toLowerCase() === key).flatMap((x) => x.TalentInvites.map((i) => i.listingId)),
      appliedTo: applied.filter((a) => a.email.toLowerCase() === key).map((a) => a.listingId),
    });
  }
  return out;
}

/** Open, public jobs a pool candidate can be invited to. */
export function openJobsFor(employerId: string) {
  return prisma.jobBoardListing.findMany({
    where: { employerId, ...publicListingWhere(), applicationType: { not: 'EXTERNAL' } },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, title: true, slug: true },
  });
}

import { prisma } from '@udyaibase/database';
import { isClaimVerified } from '@/lib/jobs/trust';
import { computeMatch, type MatchResult } from '@/lib/jobs/match';
import { jobHashOf, type AiRecommendation, type AiScreenResult } from '@/lib/jobs/ai-screen';

const MATCH_JOB = {
  skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true,
  salaryMax: true, salaryCurrency: true, maxNoticeDays: true, screeningQuestions: true,
} as const;

/** Card on the pipeline board: enough to triage without opening the candidate. */
export interface BoardCard {
  id: string;
  listingId: string;
  jobTitle: string;
  fullName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  city: string | null;
  experienceYears: number | null;
  noticePeriodDays: number | null;
  expectedCtcLakh: number | null;
  status: string;
  source: string;
  matched: number;
  jobSkills: number;
  confirmedSkills: string[];
  appliedAt: string;
  withdrawn: boolean;
  noteCount: number;
  match: { score: number; band: MatchResult['band']; knockedOut: boolean };
  /** AI screening (paid plans); null when not screened. */
  ai: { status: 'PENDING' | 'DONE' | 'FAILED'; fitScore: number | null; recommendation: AiRecommendation | null } | null;
}

export async function employerContext(employerId: string) {
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: employerId },
    select: { companyName: true, email: true, interviewBookingUrl: true, startupId: true, startupClaimMethod: true, Startup: { select: { name: true } } },
  });
  return {
    company: (e && isClaimVerified(e) && e.Startup?.name) || e?.companyName || 'Our team',
    bookingUrl: e?.interviewBookingUrl ?? null,
    email: e?.email ?? '',
  };
}

/** `jobIds` limits an interviewer to the jobs they're assigned to (null = all). */
export async function loadBoard(employerId: string, listingId?: string, jobIds: string[] | null = null): Promise<BoardCard[]> {
  if (listingId && jobIds && !jobIds.includes(listingId)) return [];
  const apps = await prisma.jobBoardApplication.findMany({
    where: { Listing: { employerId, deletedAt: null, ...(jobIds ? { id: { in: jobIds } } : {}) }, ...(listingId ? { listingId } : {}), NOT: { email: { endsWith: '@deleted.invalid' } } },
    orderBy: { appliedAt: 'desc' },
    take: 2000,
    select: {
      id: true, listingId: true, fullName: true, currentTitle: true, currentCompany: true, city: true, experienceYears: true,
      noticePeriodDays: true, expectedCtcLakh: true, status: true, source: true, matchedSkills: true, confirmedSkills: true,
      appliedAt: true, withdrawnAt: true, screeningAnswers: true,
      Listing: { select: { title: true, ...MATCH_JOB } },
      _count: { select: { Notes: true } },
      AiScreening: { select: { status: true, fitScore: true, recommendation: true } },
    },
  });
  return apps.map((a) => ({
    ai: a.AiScreening ? { status: a.AiScreening.status, fitScore: a.AiScreening.fitScore, recommendation: a.AiScreening.recommendation as AiRecommendation | null } : null,
    match: (({ score, band, knockedOut }) => ({ score, band, knockedOut }))(computeMatch(a.Listing, a)),
    id: a.id, listingId: a.listingId, jobTitle: a.Listing.title, fullName: a.fullName, currentTitle: a.currentTitle,
    currentCompany: a.currentCompany, city: a.city, experienceYears: a.experienceYears, noticePeriodDays: a.noticePeriodDays,
    expectedCtcLakh: a.expectedCtcLakh, status: a.status, source: a.source, matched: a.matchedSkills.length,
    jobSkills: a.Listing.skills.length, confirmedSkills: a.confirmedSkills, appliedAt: a.appliedAt.toISOString(),
    withdrawn: !!a.withdrawnAt, noteCount: a._count.Notes,
  }));
}

export async function loadDetail(employerId: string, id: string, jobIds: string[] | null = null) {
  const a = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: { employerId, ...(jobIds ? { id: { in: jobIds } } : {}) } },
    include: {
      Listing: { select: { id: true, title: true, slug: true, description: true, experienceBand: true, ...MATCH_JOB } },
      AiScreening: true,
      Notes: { orderBy: { createdAt: 'asc' } },
      Events: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!a) return null;
  return {
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    phone: a.phone,
    linkedinUrl: a.linkedinUrl,
    githubUrl: a.githubUrl,
    portfolioUrl: a.portfolioUrl,
    hasResume: !!(a.resumeKey || a.resumeUrl),
    coverLetter: a.coverLetter,
    currentTitle: a.currentTitle,
    currentCompany: a.currentCompany,
    city: a.city,
    experienceYears: a.experienceYears,
    noticePeriodDays: a.noticePeriodDays,
    expectedCtcLakh: a.expectedCtcLakh,
    status: a.status,
    source: a.source,
    referrerUrl: a.referrerUrl,
    utmSource: a.utmSource,
    appliedAt: a.appliedAt.toISOString(),
    withdrawnAt: a.withdrawnAt?.toISOString() ?? null,
    screeningAnswers: (Array.isArray(a.screeningAnswers) ? a.screeningAnswers : []) as { id: string; question: string; type: string; answer: string }[],
    confirmedSkills: a.confirmedSkills,
    matchedSkills: a.matchedSkills,
    job: { id: a.Listing.id, title: a.Listing.title, slug: a.Listing.slug, skills: a.Listing.skills, mustHaveSkills: a.Listing.mustHaveSkills },
    match: computeMatch(a.Listing, a),
    ai: a.AiScreening ? {
      status: a.AiScreening.status,
      fitScore: a.AiScreening.fitScore,
      recommendation: a.AiScreening.recommendation as AiRecommendation | null,
      result: a.AiScreening.result as AiScreenResult | null,
      completedAt: a.AiScreening.completedAt?.toISOString() ?? null,
      stale: a.AiScreening.status === 'DONE' && a.AiScreening.jobHash !== jobHashOf(a.Listing),
    } : null,
    notes: a.Notes.map((n) => ({ id: n.id, authorName: n.authorName, authorEmail: n.authorEmail, body: n.body, createdAt: n.createdAt.toISOString() })),
    events: a.Events.map((e) => ({
      id: e.id, fromStatus: e.fromStatus, toStatus: e.toStatus, actorEmail: e.actorEmail, emailSubject: e.emailSubject,
      emailStatus: e.emailStatus, scheduledFor: e.scheduledFor?.toISOString() ?? null, createdAt: e.createdAt.toISOString(),
    })),
  };
}

export type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof loadDetail>>>;

/** Saves a new interview booking link when one is supplied. Returns the link to use, or false if invalid. */
export async function saveBookingUrl(employerId: string, input: unknown, current: string | null): Promise<string | null | false> {
  if (typeof input !== 'string') return current;
  const url = input.trim();
  if (!url) return current;
  if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(url) || url.length > 300) return false;
  if (url !== current) await prisma.jobBoardEmployer.update({ where: { id: employerId }, data: { interviewBookingUrl: url } });
  return url;
}

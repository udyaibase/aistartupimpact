import { ensureSkillOverrides } from '@/lib/jobs/skill-overrides';
import { answerMismatches, profileSummary, type ResumeProfileData } from '@/lib/jobs/resume-profile-shared';
import { prisma } from '@udyaibase/database';
import { IN_PIPELINE } from '@/lib/employer/stages';
import { isClaimVerified } from '@/lib/jobs/trust';
import { computeMatch, type MatchResult } from '@/lib/jobs/match';
import { jobHashOf, type AiRecommendation, type AiScreenResult } from '@/lib/jobs/ai-screen';
import { votesFor } from '@/lib/employer/shortlist-votes';
import { roundsOf } from '@/lib/employer/rounds';
import { channelOf, offerState } from '@/lib/employer/stages';
import type { NextActionInput } from '@/lib/employer/next-action';
import { normalizeSkill } from '@/lib/jobs/skills';

/** What HR sees for the hidden listing that holds applications sent without a specific role. */
export const GENERAL_LABEL = 'General applications';

const MATCH_JOB = {
  skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true,
  salaryMax: true, salaryCurrency: true, salaryPeriod: true, maxNoticeDays: true, screeningQuestions: true,
} as const;

/** Must-have skills (only when the job marks some) that the candidate didn't confirm, for the card's "Missing" flag. */
export function missingMustHaves(job: { skills: string[]; mustHaveSkills: string[] }, confirmed: string[]): string[] {
  const have = new Set(confirmed.map(normalizeSkill));
  return job.mustHaveSkills.filter((x) => job.skills.includes(x) && !have.has(normalizeSkill(x)));
}

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
  /** Source to show and filter by (talent-pool invites count as Talent pool). */
  channel: string;
  matched: number;
  jobSkills: number;
  confirmedSkills: string[];
  appliedAt: string;
  /** When they entered their current stage (for the "waiting too long" badge). */
  stageSince: string;
  /** On hold: the come-back date. */
  onHoldUntil: string | null;
  /** Rejected or On hold: the internal reason code. */
  exitReason: string | null;
  /** Referral: the teammate whose link they used. */
  referredBy: string | null;
  /** In Interview: the round they're in. */
  interviewRound: string | null;
  withdrawn: boolean;
  noteCount: number;
  /** Other roles at this company the same person applied to. */
  otherRoles: number;
  /** Applied without a specific role (the hidden "General application" listing). */
  isGeneral: boolean;
  /** missingMust: must-have skills (when the job marks any) the candidate didn't say they have. */
  match: { score: number; band: MatchResult['band']; knockedOut: boolean; missingMust: string[] };
  /** Sourcing lane: ADDED | CONTACTED | INTERESTED (null for applicants), and where they were found. */
  sourcedState: string | null;
  sourcedChannel: string | null;
  /** How an ended application ended (REJECTED, WITHDRAWN, OFFER_DECLINED, NOT_JOINED). */
  outcome: string | null;
  /** On hold: the stage to resume at. */
  holdFromStatus: string | null;
  /** Hired: joining date, and when they joined (null = awaiting joining). */
  joiningDate: string | null;
  joinedAt: string | null;
  /** Inputs for the next action line (the rest come from the card itself). */
  next: Pick<NextActionInput, 'sourcedBy' | 'contactedAt' | 'assessment' | 'offer' | 'nextInterview' | 'pendingFeedback' | 'recruiter' | 'decisionOwner'>;
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
/** The most candidates one board loads. The page says so when it's reached, so nobody is silently missing. */
export const BOARD_LIMIT = 2000;

/** `page` reads past the board limit (the list view's "Load more"); `q` searches every candidate on the server. */
export async function loadBoard(employerId: string, listingId?: string, jobIds: string[] | null = null, page: { skip?: number; take?: number; q?: string } = {}): Promise<BoardCard[]> {
  await ensureSkillOverrides();
  if (listingId && jobIds && !jobIds.includes(listingId)) return [];
  const q = page.q?.trim().slice(0, 80);
  const apps = await prisma.jobBoardApplication.findMany({
    where: {
      Listing: { employerId, deletedAt: null, ...(jobIds ? { id: { in: jobIds } } : {}) }, ...(listingId ? { listingId } : {}), NOT: { email: { endsWith: '@deleted.invalid' } },
      ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }, { currentTitle: { contains: q, mode: 'insensitive' as const } }, { currentCompany: { contains: q, mode: 'insensitive' as const } }, { city: { contains: q, mode: 'insensitive' as const } }] } : {}),
    },
    orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    skip: page.skip ?? 0,
    take: Math.min(page.take ?? BOARD_LIMIT, BOARD_LIMIT),
    select: {
      id: true, listingId: true, fullName: true, currentTitle: true, currentCompany: true, city: true, experienceYears: true,
      noticePeriodDays: true, expectedCtcLakh: true, status: true, source: true, matchedSkills: true, confirmedSkills: true,
      appliedAt: true, withdrawnAt: true, screeningAnswers: true, email: true, statusChangedAt: true, onHoldUntil: true, exitReason: true, interviewRound: true,
      utmSource: true, sourcedState: true, sourcedChannel: true, sourcedBy: true, contactedAt: true, outcome: true, holdFromStatus: true, joiningDate: true, joinedAt: true,
      Referrer: { select: { name: true } },
      Listing: { select: { title: true, isGeneral: true, publishedByEmail: true, decisionOwnerEmail: true, ...MATCH_JOB } },
      Assessments: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, dueAt: true, submittedAt: true, reviewedAt: true, reviewerEmail: true } },
      Offers: { where: { status: { not: 'WITHDRAWN' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, answerBy: true, firmExpiry: true } },
      Interviews: { where: { status: 'SCHEDULED' }, orderBy: { startAt: 'asc' }, take: 6, select: { round: true, startAt: true, panelEmails: true } },
      Scorecards: { select: { round: true, authorEmail: true } },
      _count: { select: { Notes: true } },
      AiScreening: { select: { status: true, fitScore: true, recommendation: true } },
    },
  });
  // How many other roles at this company each person applied to (shown as "+2 roles" on the card).
  const emails = Array.from(new Set(apps.map((a) => a.email)));
  const perEmail = emails.length
    ? await prisma.jobBoardApplication.groupBy({
        by: ['email'],
        where: { email: { in: emails }, Listing: { employerId, deletedAt: null, ...(jobIds ? { id: { in: jobIds } } : {}) } },
        _count: { _all: true },
      })
    : [];
  const roleCount = new Map(perEmail.map((g) => [g.email, g._count._all]));
  const now = new Date();
  return apps.map((a) => ({
    otherRoles: Math.max(0, (roleCount.get(a.email) ?? 1) - 1),
    isGeneral: a.Listing.isGeneral,
    ai: a.AiScreening ? { status: a.AiScreening.status, fitScore: a.AiScreening.fitScore, recommendation: a.AiScreening.recommendation as AiRecommendation | null } : null,
    match: { ...(({ score, band, knockedOut }) => ({ score, band, knockedOut }))(computeMatch(a.Listing, a)), missingMust: missingMustHaves(a.Listing, a.confirmedSkills) },
    id: a.id, listingId: a.listingId, jobTitle: a.Listing.isGeneral ? GENERAL_LABEL : a.Listing.title, fullName: a.fullName, currentTitle: a.currentTitle,
    currentCompany: a.currentCompany, city: a.city, experienceYears: a.experienceYears, noticePeriodDays: a.noticePeriodDays,
    expectedCtcLakh: a.expectedCtcLakh, status: a.status, source: a.source, channel: channelOf(a.source, a.utmSource), matched: a.matchedSkills.length,
    jobSkills: a.Listing.skills.length, confirmedSkills: a.confirmedSkills, appliedAt: a.appliedAt.toISOString(),
    stageSince: (a.statusChangedAt ?? a.appliedAt).toISOString(), onHoldUntil: a.onHoldUntil?.toISOString() ?? null, exitReason: a.exitReason, referredBy: a.Referrer?.name ?? null, interviewRound: a.status === 'INTERVIEW' ? a.interviewRound : null,
    withdrawn: !!a.withdrawnAt, noteCount: a._count.Notes,
    sourcedState: a.sourcedState, sourcedChannel: a.sourcedChannel, outcome: a.outcome, holdFromStatus: a.holdFromStatus,
    joiningDate: a.joiningDate?.toISOString() ?? null, joinedAt: a.joinedAt?.toISOString() ?? null,
    next: nextInputs(a, now),
  }));
}

/** What the next action line needs beyond the card: assessment, offer, interviews and missing feedback, owners. */
function nextInputs(a: {
  sourcedBy: string | null; contactedAt: Date | null; interviewRound: string | null;
  Assessments: { status: string; dueAt: Date | null; submittedAt: Date | null; reviewedAt: Date | null; reviewerEmail: string | null }[];
  Offers: { status: string; answerBy: Date | null; firmExpiry: boolean }[];
  Interviews: { round: string; startAt: Date; panelEmails: string[] }[];
  Scorecards: { round: string; authorEmail: string }[];
  Listing: { publishedByEmail: string | null; decisionOwnerEmail: string | null };
}, now: Date): BoardCard['next'] {
  const as = a.Assessments[0];
  const of = a.Offers[0];
  const upcoming = a.Interviews.find((i) => i.startAt > now) ?? null;
  // Panel members of past interviews in their current round who haven't sent a scorecard.
  const done = new Set(a.Scorecards.filter((s) => s.round === a.interviewRound).map((s) => s.authorEmail.toLowerCase()));
  const pending = new Set(a.Interviews.filter((i) => i.startAt <= now && i.round === a.interviewRound).flatMap((i) => i.panelEmails.map((e) => e.toLowerCase())).filter((e) => !done.has(e)));
  return {
    sourcedBy: a.sourcedBy, contactedAt: a.contactedAt?.toISOString() ?? null,
    assessment: as ? { status: as.status, dueAt: as.dueAt?.toISOString() ?? null, submittedAt: as.submittedAt?.toISOString() ?? null, reviewedAt: as.reviewedAt?.toISOString() ?? null, reviewerEmail: as.reviewerEmail } : null,
    offer: of ? { status: of.status, state: offerState(of, now), answerBy: of.answerBy?.toISOString() ?? null } : null,
    nextInterview: upcoming ? { round: upcoming.round, startAt: upcoming.startAt.toISOString() } : null,
    pendingFeedback: pending.size,
    recruiter: a.Listing.publishedByEmail, decisionOwner: a.Listing.decisionOwnerEmail,
  };
}

export async function loadDetail(employerId: string, id: string, jobIds: string[] | null = null) {
  await ensureSkillOverrides();
  const a = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: { employerId, ...(jobIds ? { id: { in: jobIds } } : {}) } },
    include: {
      Listing: { select: { id: true, title: true, slug: true, description: true, experienceBand: true, isGeneral: true, interviewRounds: true, assessment: true, decisionOwnerEmail: true, decisionDelegateEmail: true, ...MATCH_JOB } },
      AiScreening: true,
      ResumeProfile: { select: { data: true } },
      Referrer: { select: { name: true } },
      Notes: { orderBy: { createdAt: 'asc' } },
      Events: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!a) return null;
  // The same person's other applications to this company (matched by email), so the team answers them once.
  const others = await prisma.jobBoardApplication.findMany({
    where: {
      id: { not: a.id },
      email: { equals: a.email, mode: 'insensitive' },
      Listing: { employerId, deletedAt: null, ...(jobIds ? { id: { in: jobIds } } : {}) },
    },
    orderBy: { appliedAt: 'desc' },
    take: 20,
    select: { id: true, status: true, withdrawnAt: true, appliedAt: true, Listing: { select: { id: true, title: true, isGeneral: true } } },
  });
  // One profile: what the team already wrote and decided about this person on their other applications.
  const otherIds = others.map((o) => o.id);
  const titleOf = new Map(others.map((o) => [o.id, o.Listing.isGeneral ? GENERAL_LABEL : o.Listing.title]));
  const [otherNotes, otherEvents] = otherIds.length
    ? await Promise.all([
        prisma.jobBoardApplicationNote.findMany({ where: { applicationId: { in: otherIds } }, orderBy: { createdAt: 'desc' }, take: 30 }),
        prisma.jobBoardApplicationEvent.findMany({ where: { applicationId: { in: otherIds } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      ])
    : [[], []];
  const history = [
    ...otherNotes.map((n) => ({ kind: 'note' as const, id: n.id, jobTitle: titleOf.get(n.applicationId) ?? '', at: n.createdAt.toISOString(), who: n.authorName, text: n.body.slice(0, 500), reasonCode: null as string | null })),
    ...otherEvents.map((e) => ({ kind: 'move' as const, id: e.id, jobTitle: titleOf.get(e.applicationId) ?? '', at: e.createdAt.toISOString(), who: e.actorEmail, text: `${e.fromStatus ?? 'APPLIED'}>${e.toStatus}`, reasonCode: e.reasonCode })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  const outsideVotes = await votesFor(a.id);
  return {
    history,
    outsideVotes,
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    phone: a.phone,
    linkedinUrl: a.linkedinUrl,
    githubUrl: a.githubUrl,
    portfolioUrl: a.portfolioUrl,
    hasResume: !!(a.resumeKey || a.resumeUrl),
    /** pdf: shown in the page; docx: download only (browsers can't show Word files); link: an older external link. */
    resumeType: (a.resumeKey ? (a.resumeKey.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf') : a.resumeUrl ? 'link' : null) as 'pdf' | 'docx' | 'link' | null,
    coverLetter: a.coverLetter,
    currentTitle: a.currentTitle,
    currentCompany: a.currentCompany,
    city: a.city,
    experienceYears: a.experienceYears,
    noticePeriodDays: a.noticePeriodDays,
    expectedCtcLakh: a.expectedCtcLakh,
    status: a.status,
    exitReason: a.exitReason,
    exitNote: a.exitNote,
    onHoldUntil: a.onHoldUntil?.toISOString() ?? null,
    source: a.source,
    channel: channelOf(a.source, a.utmSource),
    referredBy: a.Referrer?.name ?? null,
    referrerUrl: a.referrerUrl,
    utmSource: a.utmSource,
    appliedAt: a.appliedAt.toISOString(),
    withdrawnAt: a.withdrawnAt?.toISOString() ?? null,
    screeningAnswers: (Array.isArray(a.screeningAnswers) ? a.screeningAnswers : []) as { id: string; question: string; type: string; answer: string }[],
    confirmedSkills: a.confirmedSkills,
    matchedSkills: a.matchedSkills,
    job: {
      id: a.Listing.id, title: a.Listing.title, slug: a.Listing.slug, skills: a.Listing.skills, mustHaveSkills: a.Listing.mustHaveSkills, isGeneral: a.Listing.isGeneral, rounds: roundsOf(a.Listing.interviewRounds),
      hasAssessment: !!a.Listing.assessment, decisionOwnerEmail: a.Listing.decisionOwnerEmail, decisionDelegateEmail: a.Listing.decisionDelegateEmail,
    },
    sourcedState: a.sourcedState, sourcedChannel: a.sourcedChannel, sourcedBy: a.sourcedBy, contactedAt: a.contactedAt?.toISOString() ?? null,
    outcome: a.outcome, outcomeReasonBy: a.outcomeReasonBy, holdFromStatus: a.holdFromStatus,
    joiningDate: a.joiningDate?.toISOString() ?? null, joinedAt: a.joinedAt?.toISOString() ?? null,
    /** Set by the API for the person looking: may they record the final decision on this job? */
    canDecide: false,
    interviewRound: a.status === 'INTERVIEW' ? a.interviewRound ?? roundsOf(a.Listing.interviewRounds)[0] : null,
    otherApplications: others.map((o) => ({
      id: o.id, jobId: o.Listing.id, jobTitle: o.Listing.isGeneral ? GENERAL_LABEL : o.Listing.title, isGeneral: o.Listing.isGeneral,
      status: o.status, withdrawn: !!o.withdrawnAt, appliedAt: o.appliedAt.toISOString(),
    })),
    match: computeMatch(a.Listing, a),
    resumeProfile: a.ResumeProfile ? profileSummary(a.ResumeProfile.data as unknown as ResumeProfileData) : null,
    /** Answers that don't match the resume's dates: shown to the team to check, never scored. */
    mismatches: a.ResumeProfile ? answerMismatches(a.ResumeProfile.data as unknown as ResumeProfileData, a, a.Listing.screeningQuestions) : [],
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
      id: e.id, fromStatus: e.fromStatus, toStatus: e.toStatus, reasonCode: e.reasonCode, actorEmail: e.actorEmail, emailSubject: e.emailSubject,
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

// ── Top 10 ─────────────────────────────────────────────────────────

export const TOP_LIMIT = 10;

export interface TopCandidate {
  id: string;
  listingId: string;
  jobTitle: string;
  fullName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  experienceYears: number | null;
  noticePeriodDays: number | null;
  appliedAt: string;
  stageSince: string;
  match: { score: number; band: MatchResult['band'] };
  /** Null when not reviewed by AI yet (only shown when AI reviews are used up or off). */
  ai: { fitScore: number | null; recommendation: AiRecommendation | null; summary: string; strengths: { point: string; evidence: string }[]; gaps: string[] } | null;
}

/**
 * The best undecided candidates to look at today, across open jobs or for one job.
 * AI-reviewed candidates first (by fit score, then match score, then newest); people knocked out by a must-answer
 * question, withdrawn or erased are left out. `unscreened` says how many undecided candidates AI hasn't read yet.
 */
export async function loadTopTen(employerId: string, listingId?: string, jobIds: string[] | null = null) {
  await ensureSkillOverrides();
  if (listingId && jobIds && !jobIds.includes(listingId)) return { candidates: [] as TopCandidate[], unscreened: 0, undecided: 0 };
  const where = {
    status: { in: ['APPLIED', 'REVIEWED'] as ('APPLIED' | 'REVIEWED')[] },
    withdrawnAt: null,
    ...IN_PIPELINE,
    NOT: { email: { endsWith: '@deleted.invalid' } },
    Listing: {
      employerId, deletedAt: null, status: { in: ['OPEN', 'PAUSED'] as ('OPEN' | 'PAUSED')[] },
      ...(jobIds ? { id: { in: jobIds } } : {}),
    },
    ...(listingId ? { listingId } : {}),
  };
  const apps = await prisma.jobBoardApplication.findMany({
    where,
    orderBy: { appliedAt: 'desc' },
    take: 500,
    select: {
      id: true, listingId: true, fullName: true, currentTitle: true, currentCompany: true, experienceYears: true, noticePeriodDays: true,
      expectedCtcLakh: true, city: true, confirmedSkills: true, matchedSkills: true, screeningAnswers: true, appliedAt: true, statusChangedAt: true,
      Listing: { select: { title: true, isGeneral: true, ...MATCH_JOB } },
      AiScreening: { select: { status: true, fitScore: true, recommendation: true, result: true } },
    },
  });
  const scored = apps.map((a) => {
    const m = computeMatch(a.Listing, a);
    const done = a.AiScreening?.status === 'DONE' ? a.AiScreening : null;
    const r = (done?.result ?? null) as AiScreenResult | null;
    return {
      knockedOut: m.knockedOut,
      fit: done?.fitScore ?? -1,
      card: {
        id: a.id, listingId: a.listingId, jobTitle: a.Listing.isGeneral ? GENERAL_LABEL : a.Listing.title, fullName: a.fullName,
        currentTitle: a.currentTitle, currentCompany: a.currentCompany, experienceYears: a.experienceYears, noticePeriodDays: a.noticePeriodDays,
        appliedAt: a.appliedAt.toISOString(), stageSince: (a.statusChangedAt ?? a.appliedAt).toISOString(),
        match: { score: m.score, band: m.band },
        ai: done ? {
          fitScore: done.fitScore, recommendation: done.recommendation as AiRecommendation | null,
          summary: r?.summary ?? '', strengths: (r?.strengths ?? []).slice(0, 3), gaps: (r?.gaps ?? []).slice(0, 2),
        } : null,
      } satisfies TopCandidate,
    };
  });
  const unscreened = apps.filter((a) => !a.AiScreening || a.AiScreening.status === 'FAILED').length;
  const candidates = scored
    .filter((x) => !x.knockedOut && (x.card.ai?.recommendation ?? 'consider') !== 'weak')
    .sort((a, b) => b.fit - a.fit || b.card.match.score - a.card.match.score || +new Date(b.card.appliedAt) - +new Date(a.card.appliedAt))
    .slice(0, TOP_LIMIT)
    .map((x) => x.card);
  return { candidates, unscreened, undecided: apps.length };
}

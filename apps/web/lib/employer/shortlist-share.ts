import crypto from 'node:crypto';
import { prisma } from '@udyaibase/database';
import type { AiScreenResult } from '@/lib/jobs/ai-screen';
import { computeMatch } from '@/lib/jobs/match';
import { employerContext } from '@/lib/employer/applications';

/**
 * A private link that lets a co-founder (or anyone the team trusts) say yes, maybe or no to a job's shortlist,
 * without an account. The link holds a random token (only its sha256 is stored), expires after 14 days and can be
 * turned off at any time. It shows work details only: no email, phone or address.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
export const SHARE_DAYS = 14;
export const VOTES = ['YES', 'MAYBE', 'NO'] as const;
export type Vote = (typeof VOTES)[number];
/** Stages a shared shortlist shows. */
const SHOWN = ['SHORTLISTED', 'INTERVIEW'] as const;

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
export const shareLink = (token: string) => `${SITE}/hiring/shortlist/${token}`;
const validToken = (t: string) => /^[A-Za-z0-9_-]{30,60}$/.test(t);

export async function createShare(opts: { employerId: string; listingId: string; sharedWithName: string; createdByEmail: string; now?: Date }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = opts.now ?? new Date();
  const share = await prisma.jobBoardShortlistShare.create({
    data: {
      employerId: opts.employerId, listingId: opts.listingId, sharedWithName: opts.sharedWithName.trim().slice(0, 80),
      createdByEmail: opts.createdByEmail, tokenHash: hash(token), expiresAt: new Date(now.getTime() + SHARE_DAYS * 864e5),
    },
    select: { id: true, expiresAt: true },
  });
  return { id: share.id, link: shareLink(token), expiresAt: share.expiresAt.toISOString() };
}

/** The share behind a token, if it is still on: not revoked, not expired, job not deleted. */
export async function shareByToken(token: string, now = new Date()) {
  if (!validToken(token)) return null;
  const s = await prisma.jobBoardShortlistShare.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, employerId: true, listingId: true, sharedWithName: true, expiresAt: true, revokedAt: true },
  });
  if (!s || s.revokedAt || s.expiresAt <= now) return null;
  const listing = await prisma.jobBoardListing.findFirst({ where: { id: s.listingId, employerId: s.employerId, deletedAt: null }, select: { id: true, title: true } });
  return listing ? { ...s, jobTitle: listing.title } : null;
}

export interface SharedCandidate {
  id: string; fullName: string; currentTitle: string | null; currentCompany: string | null; city: string | null;
  experienceYears: number | null; noticePeriodDays: number | null; expectedCtcLakh: number | null; stage: string;
  matchScore: number; skillsMatched: string[]; hasResume: boolean;
  ai: { fitScore: number | null; summary: string; strengths: { point: string; evidence: string }[]; gaps: string[] } | null;
  vote: Vote | null; comment: string | null;
}

/** What the shared page shows: the shortlist for that job and this link's own votes so far. */
export async function loadSharedShortlist(token: string, now = new Date()) {
  const share = await shareByToken(token, now);
  if (!share) return null;
  const [apps, votes, ctx] = await Promise.all([
    prisma.jobBoardApplication.findMany({
      where: { listingId: share.listingId, status: { in: [...SHOWN] }, withdrawnAt: null, NOT: { email: { endsWith: '@deleted.invalid' } } },
      orderBy: { statusChangedAt: 'desc' },
      take: 50,
      select: {
        id: true, fullName: true, currentTitle: true, currentCompany: true, city: true, experienceYears: true, noticePeriodDays: true,
        expectedCtcLakh: true, status: true, confirmedSkills: true, matchedSkills: true, screeningAnswers: true, resumeKey: true, resumeUrl: true,
        Listing: { select: { skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true, maxNoticeDays: true, screeningQuestions: true } },
        AiScreening: { select: { status: true, fitScore: true, result: true } },
      },
    }),
    prisma.jobBoardShortlistVote.findMany({ where: { shareId: share.id }, select: { applicationId: true, vote: true, comment: true } }),
    employerContext(share.employerId),
  ]);
  await prisma.jobBoardShortlistShare.update({ where: { id: share.id }, data: { lastViewedAt: now } }).catch(() => {});
  const voteOf = new Map(votes.map((v) => [v.applicationId, v]));
  const candidates: SharedCandidate[] = apps.map((a) => {
    const r = a.AiScreening?.status === 'DONE' ? (a.AiScreening.result as AiScreenResult | null) : null;
    const v = voteOf.get(a.id);
    return {
      id: a.id, fullName: a.fullName, currentTitle: a.currentTitle, currentCompany: a.currentCompany, city: a.city,
      experienceYears: a.experienceYears, noticePeriodDays: a.noticePeriodDays, expectedCtcLakh: a.expectedCtcLakh,
      stage: a.status === 'INTERVIEW' ? 'Interviewing' : 'Shortlisted',
      matchScore: computeMatch(a.Listing, a).score, skillsMatched: a.matchedSkills, hasResume: !!(a.resumeKey || a.resumeUrl),
      ai: r ? { fitScore: a.AiScreening!.fitScore, summary: r.summary, strengths: r.strengths.slice(0, 3), gaps: r.gaps.slice(0, 2) } : null,
      vote: (v?.vote as Vote) ?? null, comment: v?.comment ?? null,
    };
  });
  return { shareId: share.id, sharedWithName: share.sharedWithName, jobTitle: share.jobTitle, company: ctx.company, expiresAt: share.expiresAt.toISOString(), candidates };
}

/** Records (or changes) this link's vote on one candidate. Only candidates the page shows can be voted on. */
export async function castVote(token: string, applicationId: string, vote: unknown, comment: unknown): Promise<'ok' | 'gone' | 'invalid'> {
  if (!VOTES.includes(vote as Vote)) return 'invalid';
  const share = await shareByToken(token);
  if (!share) return 'gone';
  const app = await prisma.jobBoardApplication.findFirst({
    where: { id: applicationId, listingId: share.listingId, status: { in: [...SHOWN] }, withdrawnAt: null },
    select: { id: true },
  });
  if (!app) return 'invalid';
  const text = typeof comment === 'string' ? comment.trim().replace(/\s+/g, ' ').slice(0, 300) || null : null;
  await prisma.jobBoardShortlistVote.upsert({
    where: { shareId_applicationId: { shareId: share.id, applicationId } },
    create: { shareId: share.id, applicationId, vote: vote as Vote, comment: text },
    update: { vote: vote as Vote, comment: text },
  });
  return 'ok';
}

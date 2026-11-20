import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { poolEmailHeaders, poolLink } from '@/lib/jobs/talent-pool';
import { publicListingWhere } from '@/lib/jobs/public';
import { computeMatch } from '@/lib/jobs/match';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export type InviteOutcome = 'invited' | 'not_in_pool' | 'applied' | 'hired' | 'already_invited';

/**
 * Invite one talent-pool candidate to apply for an open job: once per person per job, never someone already
 * hired, never someone who already applied. Shared by the single invite and "Invite all".
 */
export async function inviteFromPool(opts: {
  employerId: string; invitedByEmail: string; company: string; applicationId: string;
  listing: { id: string; title: string; slug: string };
}): Promise<InviteOutcome> {
  const app = await prisma.jobBoardApplication.findFirst({
    where: { id: opts.applicationId, Listing: { employerId: opts.employerId }, talentPoolUntil: { gt: new Date() }, NOT: { email: { endsWith: '@deleted.invalid' } } },
    select: { id: true, email: true, fullName: true },
  });
  if (!app) return 'not_in_pool';
  const [already, hired, sameEmail] = await Promise.all([
    prisma.jobBoardApplication.findFirst({ where: { listingId: opts.listing.id, email: { equals: app.email, mode: 'insensitive' } }, select: { id: true } }),
    // Someone you've hired works for you now: not a candidate to invite.
    prisma.jobBoardApplication.findFirst({ where: { email: { equals: app.email, mode: 'insensitive' }, status: 'HIRED', withdrawnAt: null, Listing: { employerId: opts.employerId } }, select: { id: true } }),
    prisma.jobBoardTalentInvite.findFirst({ where: { listingId: opts.listing.id, Application: { email: { equals: app.email, mode: 'insensitive' } } }, select: { id: true } }),
  ]);
  if (already) return 'applied';
  if (hired) return 'hired';
  if (sameEmail) return 'already_invited';
  try {
    await prisma.jobBoardTalentInvite.create({ data: { applicationId: app.id, listingId: opts.listing.id, invitedByEmail: opts.invitedByEmail } });
  } catch {
    return 'already_invited';
  }
  const link = `${SITE}/jobs/${opts.listing.slug}?utm_source=talent_pool&utm_medium=email`;
  sendEmailFireAndForget({
    to: app.email,
    subject: `${opts.company} would like you to apply: ${opts.listing.title}`.replace(/[\r\n]+/g, ' '),
    type: 'job_talent_invite',
    headers: poolEmailHeaders(app.id),
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Hi ${esc(app.fullName.split(' ')[0] || app.fullName)}, ${esc(opts.company)} thought of you</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">They’re hiring for <strong>${esc(opts.listing.title)}</strong> and invited you to apply, based on your earlier application.</p>
<p style="margin:0 0 24px">${button(link, 'See the role')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">You’re getting this because you chose to hear about other roles at ${esc(opts.company)} when you applied. <a href="${poolLink(app.id, 'leave')}" style="color:#6b7280">Leave their talent pool</a>.</p>`),
  });
  return 'invited';
}

/** A pool member is a match for a job from this match score up. */
export const POOL_MATCH_MIN_SCORE = 60;

export interface PoolMatch { id: string; fullName: string; currentTitle: string | null; appliedFor: string; score: number }

/**
 * "12 past applicants match this role": talent-pool members (opted in, not hired, not erased) who haven't applied
 * to or been invited to this job, scored against it by the same rules as the match badge. Best first.
 */
export async function poolMatchesForJob(employerId: string, listingId: string, now = new Date()): Promise<PoolMatch[]> {
  const job = await prisma.jobBoardListing.findFirst({
    where: { id: listingId, employerId, isGeneral: false, applicationType: { not: 'EXTERNAL' }, ...publicListingWhere(now) },
    select: { skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true, salaryMax: true, salaryCurrency: true, maxNoticeDays: true, screeningQuestions: true },
  });
  if (!job) return [];
  const pool = await prisma.jobBoardApplication.findMany({
    where: { Listing: { employerId }, talentPoolUntil: { gt: now }, NOT: { email: { endsWith: '@deleted.invalid' } } },
    orderBy: { appliedAt: 'desc' },
    take: 3000,
    select: {
      id: true, email: true, fullName: true, currentTitle: true, city: true, experienceYears: true, noticePeriodDays: true, expectedCtcLakh: true,
      confirmedSkills: true, matchedSkills: true, Listing: { select: { title: true, isGeneral: true } },
    },
  });
  if (!pool.length) return [];
  const emails = Array.from(new Set(pool.map((p) => p.email.toLowerCase())));
  const [here, hired, invited] = await Promise.all([
    prisma.jobBoardApplication.findMany({ where: { listingId, email: { in: emails, mode: 'insensitive' } }, select: { email: true } }),
    prisma.jobBoardApplication.findMany({ where: { Listing: { employerId }, status: 'HIRED', withdrawnAt: null, email: { in: emails, mode: 'insensitive' } }, select: { email: true } }),
    prisma.jobBoardTalentInvite.findMany({ where: { listingId }, select: { Application: { select: { email: true } } } }),
  ]);
  const skip = new Set([...here.map((x) => x.email), ...hired.map((x) => x.email), ...invited.map((x) => x.Application.email)].map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const out: PoolMatch[] = [];
  for (const p of pool) {
    const key = p.email.toLowerCase();
    if (skip.has(key) || seen.has(key)) continue; // newest application per person only
    seen.add(key);
    // Their answers were to another job's questions, so screening questions don't count here.
    const m = computeMatch({ ...job, screeningQuestions: null }, { ...p, screeningAnswers: null });
    if (m.score < POOL_MATCH_MIN_SCORE) continue;
    out.push({ id: p.id, fullName: p.fullName, currentTitle: p.currentTitle, appliedFor: p.Listing.isGeneral ? 'General application' : p.Listing.title, score: m.score });
  }
  return out.sort((a, b) => b.score - a.score);
}

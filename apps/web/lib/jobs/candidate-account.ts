import { prisma, Prisma } from '@udyaibase/database';
import { getUserSession } from '@/lib/user-session';
import { verifyApplySession } from '@/lib/jobs/apply-session';

/**
 * Job seeker accounts and their applications.
 *
 * - Applying while signed in links the application to the account straight away.
 * - Applications sent before (as a guest) are linked by email, but only once the account has proven it owns that email
 *   (Google sign-in or an email code). Otherwise anyone could sign up with someone else's email and see their applications.
 * - Never linked or listed: a company's imports from other tools (the person never applied here) and people a company
 *   found who haven't said they're interested yet.
 */

export interface Candidate { id: string; email: string; name: string; emailVerified: boolean }

/** The signed-in job seeker, with whether their email is verified. */
export async function getCandidate(): Promise<Candidate | null> {
  const session = await getUserSession();
  if (!session) return null;
  const row = await prisma.webUser.findUnique({ where: { id: session.id }, select: { emailVerifiedAt: true } });
  return { id: session.id, email: session.email.toLowerCase(), name: session.name, emailVerified: !!row?.emailVerifiedAt };
}

/** Which applications count as "theirs": not deleted, not a company import, not a sourcing note they haven't answered. */
export const OWN_APPLICATION: Prisma.JobBoardApplicationWhereInput = {
  source: { not: 'IMPORTED' },
  NOT: [{ email: { endsWith: '@deleted.invalid' } }],
  OR: [{ sourcedState: null }, { sourcedState: 'INTERESTED' }],
};

/** Links past guest applications sent with this (verified) email to the account. Returns how many were linked. */
export async function claimApplications(c: Candidate): Promise<number> {
  if (!c.emailVerified) return 0;
  const r = await prisma.jobBoardApplication.updateMany({
    where: { ...OWN_APPLICATION, webUserId: null, email: { equals: c.email, mode: 'insensitive' } },
    data: { webUserId: c.id },
  });
  return r.count;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.webUser.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
}

/** Everything they applied for, newest first. */
export async function listMyApplications(userId: string) {
  return prisma.jobBoardApplication.findMany({
    where: { ...OWN_APPLICATION, webUserId: userId },
    orderBy: { appliedAt: 'desc' },
    take: 200,
    select: {
      id: true, status: true, outcome: true, appliedAt: true, withdrawnAt: true, talentPoolUntil: true,
      Listing: { select: { title: true, slug: true, isGeneral: true, Employer: { select: { slug: true, companyName: true, startupClaimMethod: true, startupId: true, Startup: { select: { name: true } } } } } },
    },
  });
}

/** One of their applications (for withdraw / delete from the account). */
export async function findMyApplication(userId: string, applicationId: string) {
  return prisma.jobBoardApplication.findFirst({
    where: { ...OWN_APPLICATION, id: applicationId, webUserId: userId },
    select: { id: true, withdrawnAt: true },
  });
}

/** Their details from the last application, to fill the next one. Resume excluded. */
export async function lastApplicationDetails(userId: string) {
  const a = await prisma.jobBoardApplication.findFirst({
    where: { ...OWN_APPLICATION, webUserId: userId },
    orderBy: { appliedAt: 'desc' },
    select: {
      fullName: true, email: true, phone: true, city: true, currentTitle: true, currentCompany: true,
      experienceYears: true, noticePeriodDays: true, expectedCtcLakh: true, linkedinUrl: true, githubUrl: true, portfolioUrl: true,
    },
  });
  if (!a) return null;
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    fullName: s(a.fullName), email: s(a.email), phone: s(a.phone), city: s(a.city), currentTitle: s(a.currentTitle),
    currentCompany: s(a.currentCompany), experienceYears: s(a.experienceYears), noticePeriodDays: s(a.noticePeriodDays),
    expectedCtcLakh: s(a.expectedCtcLakh), linkedinUrl: s(a.linkedinUrl), githubUrl: s(a.githubUrl), portfolioUrl: s(a.portfolioUrl),
  };
}

/**
 * Signing in from a job page already tells us why they're here, so the "what brings you here" step is skipped
 * (it would interrupt an application). True for paths under /jobs, /my-applications and /applications.
 */
export const isJobSeekerPath = (path: string) => /^\/(jobs|my-applications|applications)(\/|\?|$)/.test(path);

/**
 * The resume from their most recent application that still has one (withdrawn ones count; deleted ones have none).
 * Reusing it copies the file for the new application, so each application keeps its own copy and deleting one
 * never removes another's resume.
 */
export async function lastResume(userId: string) {
  const a = await prisma.jobBoardApplication.findFirst({
    where: { ...OWN_APPLICATION, webUserId: userId, resumeKey: { not: null } },
    orderBy: { appliedAt: 'desc' },
    select: { resumeKey: true, appliedAt: true, Listing: { select: { title: true } } },
  });
  if (!a?.resumeKey) return null;
  return { key: a.resumeKey, appliedAt: a.appliedAt, jobTitle: a.Listing?.title ?? 'a previous job' };
}

/** "Resume from your Data Analyst application, 19 Nov": how the reused file is labelled to the candidate. */
export const lastResumeLabel = (r: { jobTitle: string; appliedAt: Date }) =>
  `Resume from your ${r.jobTitle} application, ${r.appliedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`;

/** Their application for one job, if any (applying again is blocked: one application per job and email). */
export async function myApplicationForListing(userId: string, listingId: string) {
  return prisma.jobBoardApplication.findFirst({
    where: { ...OWN_APPLICATION, webUserId: userId, listingId },
    select: { id: true, appliedAt: true, withdrawnAt: true },
  });
}

/** One of their applications with what the status page shows. */
export async function myApplicationDetail(userId: string, applicationId: string) {
  return prisma.jobBoardApplication.findFirst({
    where: { ...OWN_APPLICATION, id: applicationId, webUserId: userId },
    select: {
      id: true, status: true, outcome: true, appliedAt: true, withdrawnAt: true, source: true, talentPoolUntil: true,
      Listing: { select: { title: true, slug: true, isGeneral: true, Employer: { select: { slug: true, companyName: true, startupClaimMethod: true, startupId: true, Startup: { select: { name: true } } } } } },
    },
  });
}

/**
 * The email of the application this apply session just sent, or null. The session was issued after the human check
 * and is valid for 30 minutes, so "they applied with this address a moment ago" can stand in for a second check
 * when they ask for a sign-in code to that same address.
 */
export async function appliedEmailFor(applyToken: unknown): Promise<string | null> {
  const session = verifyApplySession(applyToken);
  if (!session) return null;
  const upload = await prisma.jobBoardResumeUpload.findUnique({ where: { id: session.uploadId }, select: { applicationId: true, listingId: true } });
  if (!upload?.applicationId || upload.listingId !== session.listingId) return null;
  const app = await prisma.jobBoardApplication.findUnique({ where: { id: upload.applicationId }, select: { email: true } });
  return app?.email?.toLowerCase() ?? null;
}

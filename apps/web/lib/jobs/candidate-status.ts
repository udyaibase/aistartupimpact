import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { Prisma } from '@prisma/client';
import { deleteResume } from '@/lib/jobs/resume-storage';

export const hashStatusToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** What the candidate sees: only the stage, never internal notes or ratings. */
export const CANDIDATE_STAGE: Record<string, { label: string; detail: string }> = {
  APPLIED: { label: 'Under review', detail: 'Your application has been sent. The hiring team will review it soon.' },
  REVIEWED: { label: 'Under review', detail: 'The hiring team is reviewing your application.' },
  SHORTLISTED: { label: 'Shortlisted', detail: 'Good news: you’ve been shortlisted. Expect to hear about next steps.' },
  INTERVIEW: { label: 'Interview', detail: 'You’re in the interview stage. Check your email for details.' },
  OFFER: { label: 'Offer', detail: 'You’ve received an offer. Check your email.' },
  HIRED: { label: 'Hired', detail: 'Congratulations on your new role!' },
  REJECTED: { label: 'Not selected', detail: 'The team decided not to move forward this time. Thank you for applying.' },
};

export async function findByStatusToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.jobBoardApplication.findFirst({
    where: { statusTokenHash: hashStatusToken(token) },
    select: {
      id: true, status: true, appliedAt: true, withdrawnAt: true, fullName: true, talentPoolUntil: true,
      Listing: { select: { title: true, slug: true, Employer: { select: { companyName: true, startupClaimMethod: true, startupId: true, Startup: { select: { name: true } } } } } },
    },
  });
}

/** DPDP erasure: removes personal data and the resume, keeps an anonymous row for the employer's counts. */
export async function eraseApplication(applicationId: string) {
  const uploads = await prisma.jobBoardResumeUpload.findMany({ where: { applicationId }, select: { id: true, key: true } });
  const app = await prisma.jobBoardApplication.findUnique({ where: { id: applicationId }, select: { resumeKey: true } });
  const keys = new Set([...uploads.map((u) => u.key), ...(app?.resumeKey ? [app.resumeKey] : [])]);
  for (const key of keys) await deleteResume(key).catch(() => {});
  await prisma.$transaction([
    prisma.jobBoardResumeUpload.deleteMany({ where: { applicationId } }),
    prisma.jobBoardApplicationNote.deleteMany({ where: { applicationId } }),
    prisma.jobBoardAiScreening.deleteMany({ where: { applicationId } }),
    prisma.jobBoardApplication.update({
      where: { id: applicationId },
      data: {
        fullName: 'Deleted applicant', email: `deleted-${applicationId}@deleted.invalid`, phone: null,
        linkedinUrl: null, portfolioUrl: null, githubUrl: null, resumeUrl: null, resumeKey: null, coverLetter: null,
        currentTitle: null, currentCompany: null, city: null, expectedCtcLakh: null, experienceYears: null, noticePeriodDays: null,
        screeningAnswers: Prisma.DbNull, confirmedSkills: [], matchedSkills: [], referrerUrl: null, notes: null,
        consentText: null, statusTokenHash: null, withdrawnAt: new Date(),
      },
    }),
  ]);
}

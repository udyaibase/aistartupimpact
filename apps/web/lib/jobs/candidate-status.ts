import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { Prisma } from '@prisma/client';
import { deleteResume } from '@/lib/jobs/resume-storage';

export const hashStatusToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** What the candidate sees: only the stage, never internal notes or ratings. */
export const CANDIDATE_STAGE: Record<string, { label: string; detail: string }> = {
  // Not opened by anyone yet: say it arrived, not that it is being reviewed.
  APPLIED: { label: 'Received', detail: 'Sent to the hiring team. They’ll review it soon.' },
  REVIEWED: { label: 'Under review', detail: 'The hiring team is reviewing your application.' },
  // On hold is an internal decision: the candidate only sees that the application is still open.
  ON_HOLD: { label: 'Under review', detail: 'The hiring team is reviewing your application.' },
  SHORTLISTED: { label: 'Shortlisted', detail: 'Good news: you’ve been shortlisted. Expect to hear about next steps.' },
  ASSESSMENT: { label: 'Assessment', detail: 'There’s a short assessment for you. Check your email for the details and deadline.' },
  INTERVIEW: { label: 'Interview', detail: 'You’re in the interview stage. Check your email for details.' },
  // Final decision is the team's internal step: the candidate sees they're still at the interview stage.
  DECISION: { label: 'Interview', detail: 'The team is finishing interviews and will be in touch about next steps.' },
  OFFER: { label: 'Offer', detail: 'You’ve received an offer. Check your email.' },
  HIRED: { label: 'Hired', detail: 'Congratulations on your new role!' },
  // How the candidate sees an ended application depends on how it ended (lib/employer/stages.ts outcomes).
  WITHDRAWN: { label: 'Withdrawn', detail: 'This application is closed. Thank you for your interest.' },
  OFFER_DECLINED: { label: 'Offer declined', detail: 'You declined the offer. Thank you for considering the role.' },
  NOT_JOINED: { label: 'Closed', detail: 'This application is closed.' },
  REJECTED: { label: 'Not selected', detail: 'The team decided not to move forward this time. Thank you for applying.' },
};

export async function findByStatusToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.jobBoardApplication.findFirst({
    where: { statusTokenHash: hashStatusToken(token) },
    select: {
      id: true, email: true, status: true, appliedAt: true, withdrawnAt: true, fullName: true, talentPoolUntil: true, outcome: true, sourcedState: true, source: true,
      Listing: { select: { title: true, slug: true, isGeneral: true, Employer: { select: { slug: true, companyName: true, startupClaimMethod: true, startupId: true, Startup: { select: { name: true } } } } } },
    },
  });
}

/** DPDP erasure: removes personal data and the resume, keeps an anonymous row for the employer's counts. */
export async function eraseApplication(applicationId: string) {
  const uploads = await prisma.jobBoardResumeUpload.findMany({ where: { applicationId }, select: { id: true, key: true } });
  const app = await prisma.jobBoardApplication.findUnique({ where: { id: applicationId }, select: { resumeKey: true } });
  const keys = new Set([...uploads.map((u) => u.key), ...(app?.resumeKey ? [app.resumeKey] : [])]);
  // A file that couldn't be deleted keeps its upload record, detached from the application, so the daily cleanup
  // of unattached uploads tries again. Dropping the record here would leave the file in storage with nothing
  // pointing at it.
  const failed: string[] = [];
  for (const key of keys) await deleteResume(key).catch(() => { failed.push(key); });
  await prisma.$transaction([
    prisma.jobBoardResumeUpload.updateMany({ where: { applicationId, key: { in: failed } }, data: { applicationId: null } }),
    prisma.jobBoardResumeUpload.deleteMany({ where: { applicationId } }),
    prisma.jobBoardApplicationNote.deleteMany({ where: { applicationId } }),
    prisma.jobBoardAiScreening.deleteMany({ where: { applicationId } }),
    // The structured resume profile is resume text: it goes with the resume.
    prisma.jobBoardResumeProfile.deleteMany({ where: { applicationId } }),
    // Opinions about them from shared shortlist links go too.
    prisma.jobBoardShortlistVote.deleteMany({ where: { applicationId } }),
    prisma.jobBoardApplication.update({
      where: { id: applicationId },
      data: {
        fullName: 'Deleted applicant', email: `deleted-${applicationId}@deleted.invalid`, phone: null,
        linkedinUrl: null, portfolioUrl: null, githubUrl: null, resumeUrl: null, resumeKey: null, coverLetter: null,
        currentTitle: null, currentCompany: null, city: null, expectedCtcLakh: null, experienceYears: null, noticePeriodDays: null,
        screeningAnswers: Prisma.DbNull, confirmedSkills: [], matchedSkills: [], referrerUrl: null, notes: null,
        consentText: null, statusTokenHash: null, withdrawnAt: new Date(),
        talentPoolUntil: null, talentPoolReminderAt: null, talentTags: [], exitNote: null,
        webUserId: null, // deleted data leaves the account too
      },
    }),
  ]);
}

const STEPS = ['Applied', 'Under review', 'Shortlisted', 'Interview', 'Offer'];
const STEP_OF: Record<string, number> = { APPLIED: 0, REVIEWED: 1, ON_HOLD: 1, SHORTLISTED: 2, ASSESSMENT: 2, INTERVIEW: 3, DECISION: 3, OFFER: 4, HIRED: 4 };

/**
 * What the candidate sees for an application: the stage label and line, whether it's closed, and the progress steps.
 * Shared by the private status link and the signed-in "My applications" page, so both always say the same thing.
 */
export function candidateView(app: { status: string; outcome: string | null; withdrawnAt: Date | null }) {
  const stage = app.withdrawnAt
    ? { label: 'Withdrawn', detail: 'You withdrew this application. The company can no longer move it forward.' }
    : (CANDIDATE_STAGE[app.status === 'REJECTED' && app.outcome && app.outcome !== 'REJECTED' ? app.outcome : app.status] ?? CANDIDATE_STAGE.APPLIED);
  return { stage, closed: !!app.withdrawnAt || app.status === 'REJECTED', step: STEP_OF[app.status] ?? 0, steps: STEPS };
}

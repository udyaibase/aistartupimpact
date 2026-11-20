import { prisma } from '@udyaibase/database';
import { IN_PIPELINE } from '@/lib/employer/stages';
import type { JobBoardAppStatus } from '@prisma/client';
import { employerContext } from '@/lib/employer/applications';
import { moveApplications, type EmailTemplate } from '@/lib/employer/pipeline';

/**
 * No-ghosting: when a job closes (by hand, filled, deleted or expired), everyone still waiting on it hears back once.
 * They move to Rejected with the reason "Position filled or closed" and get one polite email.
 * People in Interview or Offer are left alone: the team is talking to them and should tell them personally.
 */
export const STILL_WAITING: JobBoardAppStatus[] = ['APPLIED', 'REVIEWED', 'SHORTLISTED', 'ON_HOLD'];

export const CLOSED_TEMPLATE: EmailTemplate = {
  sendByDefault: true,
  subject: 'Update on the {{jobTitle}} role at {{company}}',
  body: 'Hi {{firstName}},\n\nThank you for applying for the {{jobTitle}} role at {{company}}. We’ve now closed this role, so we won’t be taking your application further this time.\n\nWe appreciate the time you took to apply and wish you the very best in your search.\n\nThe {{company}} team',
};

const waitingWhere = (listingId: string) => ({
  listingId,
  status: { in: STILL_WAITING },
  withdrawnAt: null,
  closingEmailedAt: null,
  // Sourced people who never said they're interested didn't apply: no "role closed" email for them.
  ...IN_PIPELINE,
  NOT: { email: { endsWith: '@deleted.invalid' } },
});

/** How many people would get the closing email if this job closed now (for the confirm step). */
export async function closingPreview(listingId: string): Promise<{ waiting: number; inProgress: number }> {
  const [waiting, inProgress] = await Promise.all([
    prisma.jobBoardApplication.count({ where: waitingWhere(listingId) }),
    prisma.jobBoardApplication.count({ where: { listingId, status: { in: ['INTERVIEW', 'OFFER'] }, withdrawnAt: null } }),
  ]);
  return { waiting, inProgress };
}

/**
 * Sends the closing emails for one job. Safe to run again: each application is marked `closingEmailedAt`, and the
 * move uses a fixed batch key, so nobody is moved or emailed twice. Placeholder (admin-managed) workspaces are skipped.
 */
export async function notifyClosedJob(listingId: string, actorEmail?: string): Promise<{ moved: number; emailed: number; failed: number }> {
  const listing = await prisma.jobBoardListing.findUnique({
    where: { id: listingId },
    select: { id: true, status: true, isGeneral: true, employerId: true, Employer: { select: { email: true, passwordHash: true } } },
  });
  const none = { moved: 0, emailed: 0, failed: 0 };
  if (!listing || listing.status !== 'CLOSED' || listing.isGeneral || listing.Employer.passwordHash === '') return none;

  const apps = await prisma.jobBoardApplication.findMany({ where: waitingWhere(listingId), select: { id: true }, take: 1000 });
  if (!apps.length) return none;
  const ctx = await employerContext(listing.employerId);
  const result = await moveApplications({
    employerId: listing.employerId,
    actorEmail: actorEmail || listing.Employer.email,
    company: ctx.company,
    ids: apps.map((a) => a.id),
    toStatus: 'REJECTED',
    reason: 'POSITION_CLOSED',
    email: { subject: CLOSED_TEMPLATE.subject, body: CLOSED_TEMPLATE.body },
    batchKey: `closed-${listingId}`,
  });
  // Marked even when an earlier attempt already moved them, so a reopened-then-closed job never emails twice.
  await prisma.jobBoardApplication.updateMany({ where: { id: { in: apps.map((a) => a.id) } }, data: { closingEmailedAt: new Date() } });
  return { moved: result.moved, emailed: result.emailed, failed: result.failed };
}

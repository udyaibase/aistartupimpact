import { prisma } from '@udyaibase/database';
import { deleteResume } from '@/lib/jobs/resume-storage';

/** Invoices and credit notes are tax records, so a workspace that has any keeps its payment rows. */
const invoiceWhere = (employerId: string) => ({ employerId, OR: [{ invoiceNumber: { not: null } }, { status: 'SUCCESS' as const }] });

/**
 * Deletes a hiring workspace and everything candidates shared with it.
 * With no invoices the row is removed outright. With invoices, payment rows stay (each holds the bill-to details
 * frozen when it was issued) and the workspace row is emptied of everything else, because deleting it would
 * cascade to the payments.
 */
export async function eraseWorkspace(employerId: string, accountEmail: string): Promise<{ keptInvoices: boolean }> {
  const resumes = await prisma.jobBoardApplication.findMany({
    where: { Listing: { employerId }, resumeKey: { not: null } },
    select: { resumeKey: true },
  });
  const keepInvoices = (await prisma.jobBoardPayment.count({ where: invoiceWhere(employerId) })) > 0;

  await prisma.$transaction(async (tx) => {
    await tx.newsletterSubscriber.updateMany({
      where: { email: accountEmail },
      data: { isActive: false, unsubscribedAt: new Date() },
    });
    if (!keepInvoices) {
      await tx.jobBoardEmployer.delete({ where: { id: employerId } });
      return;
    }
    await tx.jobBoardListing.deleteMany({ where: { employerId } });
    await tx.jobBoardCareersWidget.deleteMany({ where: { employerId } });
    await tx.jobBoardTeamMember.deleteMany({ where: { employerId } });
    await tx.jobBoardAiScreening.deleteMany({ where: { employerId } });
    await tx.jobBoardPayment.deleteMany({ where: { employerId, invoiceNumber: null, NOT: { status: 'SUCCESS' } } });
    const now = new Date();
    await tx.jobBoardEmployer.update({
      where: { id: employerId },
      data: {
        email: `deleted-${employerId}@deleted.invalid`,
        companyName: 'Deleted workspace',
        passwordHash: '!deleted',
        isActive: false, deactivatedAt: now, deletedAt: now, sessionsValidAfter: now,
        startupId: null, founderUserId: null,
        logoUrl: null, websiteUrl: null, description: null, tagline: null, careersHeadline: null, location: null,
        linkedinUrl: null, twitterUrl: null, brandColor: null, stage: null, teamSize: null, interviewBookingUrl: null,
        perks: [], officePhotos: [], techStack: [],
        billingName: null, billingGstin: null, billingAddress: null, billingState: null, billingType: null,
        billingAddressLine1: null, billingAddressLine2: null, billingCity: null, billingPostalCode: null,
        billingPoNumber: null, billingEmail: null, billingCcEmails: [],
        resetToken: null, resetTokenExpiry: null, pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null,
        twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [],
      },
    });
  });

  // After the data is gone; anything that fails here is still removed by the daily unsent-resume cleanup.
  await Promise.allSettled(resumes.map((r) => deleteResume(r.resumeKey!)));
  return { keptInvoices: keepInvoices };
}

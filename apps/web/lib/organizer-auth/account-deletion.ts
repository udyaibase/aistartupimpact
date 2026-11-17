import { prisma } from "@udyaibase/database";
import { sendEmailFireAndForget } from "@/lib/email/send";

/**
 * Deleting an organizer account has a grace period. The request deactivates the account at once (signed out
 * everywhere, events hidden as for any deactivated account) and schedules the deletion; signing in again within
 * the period and reactivating cancels it. The daily data-retention job finishes the deletions that are due.
 */

export const DELETION_GRACE_DAYS = 14;

/** Removes the account for good: hard delete without events, otherwise anonymise (others' records stay intact). */
export async function finishOrganizerDeletion(organizerId: string): Promise<"deleted" | "anonymised" | "skipped"> {
  const organizer = await prisma.eventOrganizer.findUnique({
    where: { id: organizerId },
    select: { id: true, email: true, deletedAt: true, deletionScheduledAt: true },
  });
  // Cancelled (reactivated) or already done.
  if (!organizer || organizer.deletedAt || !organizer.deletionScheduledAt) return "skipped";

  const hasEvents = (await prisma.event.count({ where: { organizerId } })) > 0;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.newsletterSubscriber.updateMany({ where: { email: organizer.email }, data: { isActive: false, unsubscribedAt: now } });
    await tx.eventOrganizerSession.deleteMany({ where: { organizerId } });
    if (!hasEvents) {
      await tx.eventOrganizer.delete({ where: { id: organizerId } });
      return;
    }
    // Past events hold other people's registrations, tickets and certificates, so the record stays, with
    // everything personal removed: no sign-in, no profile, events off the site, the email free to use again.
    await tx.event.updateMany({ where: { organizerId, deletedAt: null }, data: { deletedAt: now } });
    await tx.eventTeamMember.updateMany({ where: { organizerId }, data: { status: "REVOKED" } });
    await tx.organizerIntegration.deleteMany({ where: { organizerId } });
    await tx.eventOrganizer.update({
      where: { id: organizerId },
      data: {
        email: `deleted-${organizerId}@deleted.invalid`, name: "Deleted organizer", passwordHash: null, googleId: null,
        company: null, phone: null, avatar: null, bio: null, website: null, linkedin: null, verifyToken: null,
        companyEmail: null, companyDomain: null, companyEmailVerified: false, pendingEmail: null, emailChangeToken: null,
        twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [], unifiedUserId: null,
        deactivatedAt: now, deletedAt: now, deletionScheduledAt: null,
      },
    });
  });

  sendEmailFireAndForget({
    to: organizer.email,
    subject: "Your Udyaibase organizer account was deleted",
    html: `<p>Your Udyaibase organizer account has now been deleted, as requested ${DELETION_GRACE_DAYS} days ago.</p><p>If this wasn't you, contact support right away.</p>`,
    type: "security_alert",
  });
  return hasEvents ? "anonymised" : "deleted";
}

/** Finishes every deletion whose grace period is over. Returns how many accounts were removed. */
export async function runScheduledOrganizerDeletions(limit = 50): Promise<number> {
  const due = await prisma.eventOrganizer.findMany({
    where: { deletionScheduledAt: { lte: new Date() }, deletedAt: null },
    select: { id: true },
    take: limit,
  });
  let done = 0;
  for (const { id } of due) {
    try {
      if ((await finishOrganizerDeletion(id)) !== "skipped") done++;
    } catch (err) {
      console.error("[organizer-deletion] failed for", id, err);
    }
  }
  return done;
}

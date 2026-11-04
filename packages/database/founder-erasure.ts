import { prisma } from './index';

/**
 * Erases a founder's account (the DPDP right to erasure). The single path for every delete button, in both apps.
 *
 * - Listings they submitted are deleted.
 * - Listings that were already in the public directory and they claimed stay public, as company information, but are
 *   released: no owner, no Verified badge, claimable again.
 * - Their stories and updates are unpublished.
 * - If they have paid invoices, tax law requires us to keep those: the payment rows stay, linked to a blanked record
 *   with no personal data. Otherwise the record is deleted outright.
 * - Their sign-in identity goes too, unless they still host events with the same email.
 * - Their photos, and the logos and screenshots of deleted listings, are removed from storage unless still in use.
 */
export async function eraseFounderRecords(founderId: string): Promise<{ mediaUrls: (string | null)[] } | null> {
  const founder = await prisma.founderUser.findUnique({ where: { id: founderId }, select: { id: true, email: true, avatar: true } });
  if (!founder) return null;
  const email = founder.email.toLowerCase();
  const now = new Date();
  const [webUser, unifiedUser] = await Promise.all([
    prisma.webUser.findUnique({ where: { email }, select: { avatar: true } }),
    prisma.unifiedUser.findUnique({ where: { email }, select: { avatar: true } }),
  ]);
  const photos = [founder.avatar, webUser?.avatar, unifiedUser?.avatar].filter((u): u is string => !!u);
  const mediaToDelete: (string | null)[] = [...photos];

  await prisma.$transaction(async (tx) => {
    const isOwnSubmission = (submittedBy: string | null) => submittedBy === 'FOUNDER' || submittedBy === founderId;

    const startups = await tx.startup.findMany({ where: { ownerId: founderId }, select: { id: true, submittedBy: true, logoUrl: true, foundersData: true } });
    const tools = await tx.aiTool.findMany({ where: { ownerId: founderId }, select: { id: true, submittedBy: true, logoUrl: true, screenshotUrls: true } });
    const claimedStartups = startups.filter((s) => !isOwnSubmission(s.submittedBy)).map((s) => s.id);
    const claimedTools = tools.filter((t) => !isOwnSubmission(t.submittedBy)).map((t) => t.id);

    for (const s of startups) if (isOwnSubmission(s.submittedBy)) mediaToDelete.push(s.logoUrl);
    for (const t of tools) if (isOwnSubmission(t.submittedBy)) mediaToDelete.push(t.logoUrl, ...(t.screenshotUrls ?? []));

    // A listing that stays public mustn't keep showing this person's photo.
    for (const s of startups) {
      if (isOwnSubmission(s.submittedBy) || !Array.isArray(s.foundersData)) continue;
      const people = s.foundersData as { avatar?: string }[];
      if (people.some((p) => p?.avatar && photos.includes(p.avatar))) {
        const cleaned = people.map((p) => (p?.avatar && photos.includes(p.avatar) ? { ...p, avatar: '' } : p));
        await tx.startup.update({ where: { id: s.id }, data: { foundersData: cleaned } });
      }
    }

    await tx.article.updateMany({
      where: { OR: [{ submittedById: founderId }, { founderAuthorId: founderId }], type: { in: ['FOUNDER_STORY', 'STARTUP_UPDATE'] } },
      data: { deletedAt: now },
    });

    await tx.startup.updateMany({
      where: { id: { in: claimedStartups } },
      data: {
        ownerId: null, claimedBy: null, claimedAt: null, isVerified: false, verifiedAt: null,
        verifiedDomain: null, verificationToken: null, claimStatus: 'UNCLAIMED',
      },
    });
    await tx.aiTool.updateMany({
      where: { id: { in: claimedTools } },
      data: { ownerId: null, isUrlVerified: false, claimStatus: 'UNCLAIMED' },
    });
    await tx.startup.deleteMany({ where: { ownerId: founderId } });
    await tx.aiTool.deleteMany({ where: { ownerId: founderId } });

    // Jobs in a workspace only they ran stop taking applicants. Applicant data then ages out on the hiring retention job.
    const workspaces = await tx.jobBoardEmployer.findMany({ where: { founderUserId: founderId, passwordHash: '!founder-sso' }, select: { id: true } });
    if (workspaces.length > 0) {
      await tx.jobBoardListing.updateMany({
        where: { employerId: { in: workspaces.map((w) => w.id) }, status: 'OPEN' },
        data: { status: 'CLOSED', isActive: false, closedAt: now, closeReason: 'MANUAL' },
      });
    }

    // Past versions can hold this person's details, and what they sent for review goes with them.
    const listingIds = [...startups.map((s) => s.id), ...tools.map((t) => t.id)];
    await tx.listingVersion.deleteMany({ where: { OR: [{ entityId: { in: listingIds } }, { actorId: founderId }] } });
    await tx.listingPendingEdit.deleteMany({ where: { OR: [{ entityId: { in: listingIds } }, { submittedById: founderId }] } });

    await tx.newsletterSubscriber.updateMany({ where: { email }, data: { isActive: false, unsubscribedAt: now } });
    await tx.founderTeamMember.deleteMany({ where: { email } });
    await tx.emailLog.deleteMany({ where: { to: email } });
    // Tickets stay for the record of what was handled, without saying whose they were.
    await tx.supportTicket.updateMany({
      where: { submitterId: founderId },
      data: { submitterEmail: 'deleted@deleted.invalid', submitterName: 'Deleted founder' },
    });

    const paid = await tx.advPayment.count({ where: { founderId, razorpayPaymentId: { not: null } } });
    if (paid > 0) {
      await tx.founderNotification.deleteMany({ where: { userId: founderId } });
      await tx.founderSession.deleteMany({ where: { userId: founderId } });
      await tx.startupVerificationLog.deleteMany({ where: { userId: founderId } });
      await tx.founderUser.update({
        where: { id: founderId },
        data: {
          email: `deleted-${founderId}@deleted.invalid`, name: 'Deleted founder', passwordHash: null, company: null,
          previousCompany: null, role: null, phone: null, avatar: null, bio: null, linkedin: null, twitter: null,
          website: null, verifyToken: null, resetToken: null, resetExpiry: null, companyDomain: null, companyEmail: null,
          googleId: null, twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [], pendingEmail: null,
          emailChangeToken: null, emailChangeTokenExpiry: null, unifiedUserId: null, status: 'SUSPENDED',
          deactivatedAt: now, deletedAt: now, sessionsValidAfter: now,
        },
      });
    } else {
      await tx.founderUser.delete({ where: { id: founderId } });
    }

    const hostsEvents = await tx.eventOrganizer.count({ where: { email } });
    if (hostsEvents === 0) {
      await tx.accountTwoFactor.deleteMany({ where: { email } });
      await tx.webUser.deleteMany({ where: { email } });
      await tx.unifiedUser.deleteMany({ where: { email } });
    }
  }, { maxWait: 10_000, timeout: 30_000 });

  return { mediaUrls: mediaToDelete };
}

/** Of these file URLs, the ones no remaining record shows, so they're safe to remove from storage. */
export async function findUnusedMedia(urls: (string | null | undefined)[]): Promise<string[]> {
  const unused: string[] = [];
  for (const url of new Set(urls)) {
    if (!url) continue;
    const [founders, webUsers, unifiedUsers, startups, tools, employers, inFounderData] = await Promise.all([
      prisma.founderUser.count({ where: { avatar: url } }),
      prisma.webUser.count({ where: { avatar: url } }),
      prisma.unifiedUser.count({ where: { avatar: url } }),
      prisma.startup.count({ where: { logoUrl: url } }),
      prisma.aiTool.count({ where: { OR: [{ logoUrl: url }, { screenshotUrls: { has: url } }] } }),
      prisma.jobBoardEmployer.count({ where: { logoUrl: url } }),
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Startup" WHERE "foundersData"::text LIKE ${`%${url}%`}`,
    ]);
    if (founders + webUsers + unifiedUsers + startups + tools + employers + (inFounderData[0]?.n ?? 0) === 0) unused.push(url);
  }
  return unused;
}

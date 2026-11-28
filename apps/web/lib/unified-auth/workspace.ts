import { claimHostAutoOffers } from '@/lib/offers/claim';
import { prisma } from "@udyaibase/database";
import crypto from "crypto";

/**
 * Unlock a workspace for a user.
 * Handles: link existing, create fresh, high-value confirmation.
 * 
 * Architecture: UnifiedUser is the identity. FounderUser/EventOrganizer are profile tables
 * that point BACK to UnifiedUser via unifiedUserId FK.
 */
export async function unlockWorkspace(
  userId: string,
  workspace: "organizer" | "founder",
  ipAddress?: string
): Promise<{ status: "unlocked" | "linked" | "verification_required" | "confirmation_pending" | "already_unlocked" | "error"; message: string; redirectTo?: string }> {

  const user = await prisma.unifiedUser.findUnique({
    where: { id: userId },
    include: {
      founderProfile: { select: { id: true } },
      organizerProfile: { select: { id: true } },
    },
  });
  if (!user) return { status: "error", message: "User not found" };

  // Already unlocked? (profile points to this user)
  if (workspace === "organizer" && user.organizerProfile) {
    return { status: "already_unlocked", message: "Organizer workspace already active", redirectTo: "/organizer/events" };
  }
  if (workspace === "founder" && user.founderProfile) {
    return { status: "already_unlocked", message: "Founder workspace already active", redirectTo: "/founder" };
  }

  // Note: email verification is only required when linking to an EXISTING high-value account.
  // For fresh workspace creation, being authenticated is sufficient.
  // The verification check is inside unlockOrganizer/unlockFounder for the "link existing" path only.

  if (workspace === "organizer") {
    return await unlockOrganizer(user, userId, ipAddress);
  }

  if (workspace === "founder") {
    return await unlockFounder(user, userId, ipAddress);
  }

  return { status: "error", message: "Invalid workspace" };
}

async function unlockOrganizer(user: any, userId: string, ipAddress?: string) {
  // Check for existing EventOrganizer with this email (not yet linked)
  const existing = await prisma.eventOrganizer.findUnique({ where: { email: user.email } });

  if (existing) {
    // Already linked to another UnifiedUser?
    if (existing.unifiedUserId && existing.unifiedUserId !== userId) {
      return { status: "error" as const, message: "This organizer profile is linked to another account" };
    }

    // Already linked to this user (shouldn't happen due to check above, but safety)
    if (existing.unifiedUserId === userId) {
      return { status: "already_unlocked" as const, message: "Already linked", redirectTo: "/organizer/events" };
    }

    // High-value check: 10+ events → require confirmation email
    const eventCount = await prisma.event.count({ where: { organizerId: existing.id, deletedAt: null } });
    if (eventCount >= 10) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72);

      await prisma.workspaceLinkRequest.create({
        data: { userId, workspace: "organizer", targetId: existing.id, token, expiresAt },
      });

      return { status: "confirmation_pending" as const, message: `Confirmation email sent to ${user.email}. Valid for 72 hours.` };
    }

    // Link existing: set unifiedUserId on EventOrganizer (atomic via unique constraint)
    const result = await prisma.eventOrganizer.updateMany({
      where: { id: existing.id, unifiedUserId: null },
      data: { unifiedUserId: userId },
    });

    if (result.count === 0) return { status: "already_unlocked" as const, message: "Already linked", redirectTo: "/organizer/events" };

    // Credential merge: add-only
    if (existing.passwordHash && !user.passwordHash) {
      await prisma.unifiedUser.update({ where: { id: userId }, data: { passwordHash: existing.passwordHash } });
    }

    await prisma.workspaceLinkLog.create({
      data: { userId, workspace: "organizer", action: "linked_existing", linkedId: existing.id, emailMatch: true, verified: true, ipAddress },
    });

    // Update lastWorkspace
    await prisma.unifiedUser.update({ where: { id: userId }, data: { lastWorkspace: "ORGANIZER" } });

    return { status: "linked" as const, message: "Organizer workspace linked!", redirectTo: "/organizer/events" };
  } else {
    // Create fresh organizer profile linked to this UnifiedUser
    const newOrganizer = await prisma.eventOrganizer.create({
      data: {
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        emailVerified: true,
        status: "ACTIVE",
        unifiedUserId: userId,
      },
    });
    // A new host account with a confirmed email: a running offer for new hosts or verified founders is granted now.
    await claimHostAutoOffers(newOrganizer.id);

    await prisma.workspaceLinkLog.create({
      data: { userId, workspace: "organizer", action: "created_fresh", linkedId: newOrganizer.id, emailMatch: false, verified: true, ipAddress },
    });

    await prisma.unifiedUser.update({ where: { id: userId }, data: { lastWorkspace: "ORGANIZER" } });

    return { status: "unlocked" as const, message: "Organizer workspace created!", redirectTo: "/organizer/events" };
  }
}

async function unlockFounder(user: any, userId: string, ipAddress?: string) {
  const existing = await prisma.founderUser.findUnique({ where: { email: user.email } });

  if (existing) {
    // Already linked to another UnifiedUser?
    if (existing.unifiedUserId && existing.unifiedUserId !== userId) {
      return { status: "error" as const, message: "This founder profile is linked to another account" };
    }

    if (existing.unifiedUserId === userId) {
      return { status: "already_unlocked" as const, message: "Already linked", redirectTo: "/founder" };
    }

    // High-value check: 2FA enabled → require confirmation
    if (existing.twoFactorEnabled) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72);

      await prisma.workspaceLinkRequest.create({
        data: { userId, workspace: "founder", targetId: existing.id, token, expiresAt },
      });

      return { status: "confirmation_pending" as const, message: "This account has 2FA. Confirmation email sent." };
    }

    // Link existing: set unifiedUserId on FounderUser
    const result = await prisma.founderUser.updateMany({
      where: { id: existing.id, unifiedUserId: null },
      data: { unifiedUserId: userId },
    });

    if (result.count === 0) return { status: "already_unlocked" as const, message: "Already linked", redirectTo: "/founder" };

    // Credential merge + 2FA inheritance
    if (existing.passwordHash && !user.passwordHash) {
      await prisma.unifiedUser.update({ where: { id: userId }, data: { passwordHash: existing.passwordHash } });
    }
    if (existing.twoFactorEnabled) {
      await prisma.unifiedUser.update({
        where: { id: userId },
        data: { twoFactorEnabled: true, twoFactorSecret: existing.twoFactorSecret, twoFactorBackupCodes: existing.twoFactorBackupCodes, twoFactorInherited: true },
      });
    }

    await prisma.workspaceLinkLog.create({
      data: { userId, workspace: "founder", action: "linked_existing", linkedId: existing.id, emailMatch: true, verified: true, ipAddress },
    });

    await prisma.unifiedUser.update({ where: { id: userId }, data: { lastWorkspace: "FOUNDER" } });

    return { status: "linked" as const, message: "Founder workspace linked!", redirectTo: "/founder" };
  } else {
    // Create fresh founder profile linked to this UnifiedUser
    const newFounder = await prisma.founderUser.create({
      data: {
        id: crypto.randomUUID(),
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        emailVerified: true,
        status: "ACTIVE",
        authProvider: "unified",
        updatedAt: new Date(),
        unifiedUserId: userId,
      },
    });

    await prisma.workspaceLinkLog.create({
      data: { userId, workspace: "founder", action: "created_fresh", linkedId: newFounder.id, emailMatch: false, verified: true, ipAddress },
    });

    await prisma.unifiedUser.update({ where: { id: userId }, data: { lastWorkspace: "FOUNDER" } });

    return { status: "unlocked" as const, message: "Founder workspace created!", redirectTo: "/founder" };
  }
}

import { prisma } from '@udyaibase/database';
import type { Prisma } from '@prisma/client';
import { websiteDomain } from '@/lib/jobs/trust';

type Tx = Prisma.TransactionClient | typeof prisma;

/** Marks startups an employer added themselves (not yet approved for the public directory). */
export const employerSubmitter = (employerId: string) => `employer:${employerId}`;

/**
 * The single record of "this startup's domain is proven". Written by every verification path
 * (founder DNS, founder work email, employer work email, admin) so the founder portal, the
 * employer portal and public pages all agree on who is verified.
 *
 * Pass `founderUserId` when the proof came from a founder account: it also records them as owner and moves what
 * we already hold for the startup to them (see adoptStartupContent).
 */
/** How long a verification lasts before it must be renewed (DNS renews itself while the record stays). */
export const VERIFICATION_VALID_DAYS = 365;

export type VerificationProof = {
  method: 'DNS' | 'EMAIL';
  /** The work email that received the code (EMAIL). */
  email?: string | null;
  /** The DNS token that was found (DNS); kept so the record can be re-checked later. */
  token?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function markStartupVerified(
  tx: Tx,
  startupId: string,
  domain: string,
  founderUserId?: string,
  proof?: VerificationProof,
): Promise<void> {
  const now = new Date();
  const current = await tx.startup.findUnique({ where: { id: startupId }, select: { verifiedAt: true } });
  await tx.startup.update({
    where: { id: startupId },
    data: {
      isVerified: true,
      verifiedDomain: domain,
      verifiedAt: current?.verifiedAt ?? now,
      claimStatus: 'VERIFIED',
      ...(founderUserId ? { ownerId: founderUserId, claimedBy: founderUserId, claimedAt: now } : {}),
      ...(proof ? {
        verificationMethod: proof.method,
        verifiedEmail: proof.method === 'EMAIL' ? (proof.email ?? null)?.toLowerCase() ?? null : null,
        verificationExpiresAt: new Date(now.getTime() + VERIFICATION_VALID_DAYS * 86_400_000),
        verificationCheckedAt: now,
        verificationRemindedAt: null,
        ...(proof.method === 'DNS' && proof.token ? { verificationToken: proof.token } : {}),
      } : {}),
    },
  });
  // Audit trail: who proved it, how, with which email, from where.
  if (proof && founderUserId) {
    await tx.startupVerificationLog.create({
      data: {
        id: crypto.randomUUID(),
        startupId,
        userId: founderUserId,
        action: `${proof.method}_VERIFIED`,
        method: proof.method,
        token: proof.method === 'DNS' ? (proof.token ?? null) : null,
        dnsRecord: proof.method === 'DNS' && proof.token ? `udyaibase-verify=${proof.token}` : null,
        email: proof.method === 'EMAIL' ? (proof.email ?? null)?.toLowerCase() ?? null : null,
        success: true,
        ipAddress: proof.ipAddress ?? null,
        userAgent: proof.userAgent ?? null,
      },
    });
  }
  if (founderUserId) await adoptStartupContent(tx, startupId, domain, founderUserId);
}

/**
 * Brings what we already hold for a startup into the dashboard of the founder who proved they own it. Only touches
 * records with no owner, so nobody else's work moves. Articles, events, milestones, funding and view history hang
 * off the startup itself and appear on their own.
 */
async function adoptStartupContent(tx: Tx, startupId: string, domain: string, founderUserId: string) {
  // AI tools linked to this startup, or on the domain they've just proven.
  const candidates = await tx.aiTool.findMany({
    where: {
      ownerId: null,
      deletedAt: null,
      OR: [{ startupId }, { websiteUrl: { contains: domain, mode: 'insensitive' } }],
    },
    select: { id: true, startupId: true, websiteUrl: true },
  });
  const ids = candidates.filter((t) => t.startupId === startupId || websiteDomain(t.websiteUrl) === domain).map((t) => t.id);
  if (ids.length > 0) {
    await tx.aiTool.updateMany({ where: { id: { in: ids } }, data: { ownerId: founderUserId, startupId } });
    await tx.aiTool.updateMany({ where: { id: { in: ids }, claimStatus: 'UNCLAIMED' }, data: { claimStatus: 'CLAIMED' } });
  }

  // Jobs an admin added for this startup: the founder sees them under Hiring, and "Open hiring" hands them over.
  await tx.jobBoardEmployer.updateMany({
    where: { startupId, passwordHash: '', founderUserId: null },
    data: { founderUserId },
  });
}

/** True when this founder owns the startup and its domain is proven. */
export async function founderOwnsVerifiedStartup(founderUserId: string, startupId: string) {
  const s = await prisma.startup.findFirst({
    where: { id: startupId, ownerId: founderUserId, isVerified: true, deletedAt: null },
    select: { id: true, name: true, slug: true, websiteUrl: true, verifiedDomain: true, logoUrl: true, isApproved: true },
  });
  return s;
}

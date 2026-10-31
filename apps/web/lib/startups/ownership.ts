import { prisma } from '@udyaibase/database';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient | typeof prisma;

/** Marks startups an employer added themselves (not yet approved for the public directory). */
export const employerSubmitter = (employerId: string) => `employer:${employerId}`;

/**
 * The single record of "this startup's domain is proven". Written by every verification path
 * (founder DNS, founder work email, employer work email, admin) so the founder portal, the
 * employer portal and public pages all agree on who is verified.
 *
 * Pass `founderUserId` when the proof came from a founder account: it also records them as owner.
 */
export async function markStartupVerified(
  tx: Tx,
  startupId: string,
  domain: string,
  founderUserId?: string,
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
    },
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

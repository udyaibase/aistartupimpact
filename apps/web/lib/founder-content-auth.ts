import { prisma } from "@udyaibase/database";
import { getFounderSession } from "@/lib/founder-auth";
import type { FounderTeamRole } from "@/lib/founder-team-permissions";

interface ContentAuthResult {
  authorized: boolean;
  role: FounderTeamRole;
  userId: string;
  email: string;
  name: string;
  startupId: string;
  /** Only verified startups may publish or submit updates and stories (drafts are always allowed). */
  startupVerified: boolean;
}

export const UNVERIFIED_STARTUP_ERROR = 'Only verified startups can post updates and stories. Verify your startup first; you can keep this as a draft meanwhile.';

export async function verifyStartupAccess(
  startupId: string
): Promise<ContentAuthResult | null> {
  const session = await getFounderSession();
  if (!session) return null;

  const startup = await prisma.startup.findUnique({
    where: { id: startupId },
    select: { id: true, ownerId: true, isVerified: true },
  });
  if (!startup) return null;

  if (startup.ownerId === session.userId) {
    return {
      authorized: true,
      role: "OWNER",
      userId: session.userId,
      email: session.email,
      name: session.name,
      startupId: startup.id,
      startupVerified: startup.isVerified,
    };
  }

  const membership = await prisma.founderTeamMember.findFirst({
    where: {
      founderId: startup.ownerId!,
      email: session.email.toLowerCase(),
      status: "ACTIVE",
    },
    select: { role: true },
  });

  if (!membership) return null;

  return {
    authorized: true,
    role: membership.role as FounderTeamRole,
    userId: session.userId,
    email: session.email,
    name: session.name,
    startupId: startup.id,
    startupVerified: startup.isVerified,
  };
}

export async function getFounderStartups(userId: string) {
  const owned = await prisma.startup.findMany({
    where: { ownerId: userId, deletedAt: null },
    select: { id: true, name: true, slug: true, logoUrl: true },
    orderBy: { name: "asc" },
  });

  const founder = await prisma.founderUser.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!founder) return owned.map((s) => ({ ...s, role: "OWNER" as const }));

  const teamMemberships = await prisma.founderTeamMember.findMany({
    where: { email: founder.email.toLowerCase(), status: "ACTIVE" },
    select: { founderId: true, role: true },
  });

  const memberStartupOwnerIds = teamMemberships.map((m) => m.founderId);
  const memberStartups =
    memberStartupOwnerIds.length > 0
      ? await prisma.startup.findMany({
          where: {
            ownerId: { in: memberStartupOwnerIds },
            deletedAt: null,
            id: { notIn: owned.map((s) => s.id) },
          },
          select: { id: true, name: true, slug: true, logoUrl: true, ownerId: true },
          orderBy: { name: "asc" },
        })
      : [];

  return [
    ...owned.map((s) => ({ ...s, role: "OWNER" as const })),
    ...memberStartups.map((s) => {
      const membership = teamMemberships.find((m) => m.founderId === s.ownerId);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        logoUrl: s.logoUrl,
        role: (membership?.role || "VIEWER") as FounderTeamRole,
      };
    }),
  ];
}

import { prisma } from '@udyaibase/database';
import type { FounderSession } from '@/lib/founder-auth';
import type { FounderTeamRole } from '@/lib/founder-team-permissions';

/**
 * Who can do what with a listing. A person is the owner of their own listings, and has their team role on the listings
 * of any founder whose team they've joined. Always checked here on the server, whatever the screen shows.
 */

async function activeMemberships(email: string) {
  return prisma.founderTeamMember.findMany({
    where: { email: email.toLowerCase(), status: 'ACTIVE' },
    select: { founderId: true, role: true },
  });
}

/** Everyone whose listings this person can see: themselves, then the founders whose teams they're on. */
export async function workspaceOwnerIds(session: Pick<FounderSession, 'userId' | 'email'>): Promise<string[]> {
  const memberships = await activeMemberships(session.email);
  return [session.userId, ...memberships.map((m) => m.founderId).filter((id) => id !== session.userId)];
}

/** This person's role over everything a given founder owns, or null when they have none. */
export async function roleForOwner(session: Pick<FounderSession, 'userId' | 'email'>, ownerId: string | null): Promise<FounderTeamRole | null> {
  if (!ownerId) return null;
  if (ownerId === session.userId) return 'OWNER';
  const membership = await prisma.founderTeamMember.findFirst({
    where: { founderId: ownerId, email: session.email.toLowerCase(), status: 'ACTIVE' },
    select: { role: true },
  });
  return (membership?.role as FounderTeamRole | undefined) ?? null;
}

/** Roles by owner, for pages listing several workspaces. */
export async function rolesByOwner(session: Pick<FounderSession, 'userId' | 'email'>): Promise<Map<string, FounderTeamRole>> {
  const roles = new Map<string, FounderTeamRole>([[session.userId, 'OWNER']]);
  for (const m of await activeMemberships(session.email)) {
    if (m.founderId !== session.userId) roles.set(m.founderId, m.role as FounderTeamRole);
  }
  return roles;
}

/**
 * The team someone is managing: their own if they have a listing or a team, otherwise the first team they've joined.
 * Team pages act on this owner, with this role.
 */
export async function teamContext(session: Pick<FounderSession, 'userId' | 'email'>): Promise<{ ownerId: string; role: FounderTeamRole }> {
  const [ownStartups, ownMembers, memberships] = await Promise.all([
    prisma.startup.count({ where: { ownerId: session.userId, deletedAt: null } }),
    prisma.founderTeamMember.count({ where: { founderId: session.userId } }),
    activeMemberships(session.email),
  ]);
  if (ownStartups > 0 || ownMembers > 0 || memberships.length === 0) return { ownerId: session.userId, role: 'OWNER' };
  const best = memberships.find((m) => m.role === 'ADMIN') ?? memberships[0];
  return { ownerId: best.founderId, role: best.role as FounderTeamRole };
}

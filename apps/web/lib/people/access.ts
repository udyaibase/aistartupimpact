import { prisma } from '@udyaibase/database';
import { ROLE_LABEL } from '@/lib/employer/roles';

/**
 * One view over the two team systems a founder owns:
 * - the founder team (FounderTeamMember: profile and content, roles Owner/Admin/Editor/Viewer)
 * - the hiring team of each startup workspace they opened (JobBoardTeamMember: Owner/Recruiter/Interviewer).
 * They stay separate on purpose (different people, different permissions); this module joins them by email
 * so a founder can see and remove access in one place, and one person can move between the two portals.
 */

const norm = (e: string) => e.trim().toLowerCase();

export interface PersonAccess {
  email: string;
  name: string | null;
  /** Founder portal role, if they're on the founder team. */
  content: { memberId: string; role: string; status: 'ACTIVE' | 'PENDING' } | null;
  /** Hiring roles, one per startup workspace. */
  hiring: { memberId: string; workspaceId: string; startup: string; role: string; roleLabel: string; status: 'ACTIVE' | 'PENDING' }[];
}

/** Hiring workspaces opened from this founder's account (one per startup). */
export function founderWorkspaces(founderUserId: string) {
  return prisma.jobBoardEmployer.findMany({
    where: { founderUserId, deletedAt: null },
    select: { id: true, companyName: true, Startup: { select: { name: true } } },
  });
}

export async function peopleWithAccess(founderUserId: string): Promise<PersonAccess[]> {
  const [content, workspaces] = await Promise.all([
    prisma.founderTeamMember.findMany({
      where: { founderId: founderUserId, status: { in: ['ACTIVE', 'PENDING'] }, role: { not: 'OWNER' } },
      select: { id: true, email: true, name: true, role: true, status: true },
    }),
    founderWorkspaces(founderUserId),
  ]);
  const hiring = workspaces.length
    ? await prisma.jobBoardTeamMember.findMany({
        where: { employerId: { in: workspaces.map((w) => w.id) }, status: { in: ['ACTIVE', 'PENDING'] } },
        select: { id: true, email: true, name: true, role: true, status: true, employerId: true },
      })
    : [];

  const byEmail = new Map<string, PersonAccess>();
  const get = (email: string, name: string | null) => {
    const key = norm(email);
    const p = byEmail.get(key) ?? { email: key, name: null, content: null, hiring: [] };
    p.name ??= name;
    byEmail.set(key, p);
    return p;
  };
  for (const m of content) get(m.email, m.name).content = { memberId: m.id, role: m.role, status: m.status as 'ACTIVE' | 'PENDING' };
  for (const m of hiring) {
    const w = workspaces.find((x) => x.id === m.employerId)!;
    get(m.email, m.name).hiring.push({
      memberId: m.id, workspaceId: w.id, startup: w.Startup?.name ?? w.companyName,
      role: m.role, roleLabel: ROLE_LABEL[m.role], status: m.status as 'ACTIVE' | 'PENDING',
    });
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

/** Remove someone from every hiring team this founder owns. Returns how many memberships ended. */
export async function removeHiringAccess(founderUserId: string, email: string): Promise<number> {
  const workspaces = await founderWorkspaces(founderUserId);
  if (!workspaces.length) return 0;
  const r = await prisma.jobBoardTeamMember.updateMany({
    where: { employerId: { in: workspaces.map((w) => w.id) }, email: { equals: norm(email), mode: 'insensitive' }, status: { in: ['ACTIVE', 'PENDING'] } },
    data: { status: 'REMOVED', inviteTokenHash: null, inviteExpiresAt: null },
  });
  return r.count;
}

/** Active hiring memberships for a signed-in founder-portal person (to open a workspace without a second sign-in). */
export function hiringMembershipsFor(email: string) {
  return prisma.jobBoardTeamMember.findMany({
    where: { email: { equals: norm(email), mode: 'insensitive' }, status: 'ACTIVE', Employer: { deletedAt: null, isActive: true, deactivatedAt: null } },
    select: { id: true, role: true, employerId: true, Employer: { select: { companyName: true, Startup: { select: { name: true } } } } },
  });
}

/**
 * The founder-portal account a hiring session may switch to, or null.
 * - The workspace's own account, when it was opened from the founder portal (that founder).
 * - A teammate whose email has a founder-portal account.
 * Never when that founder account uses two-step sign-in.
 */
export async function founderAccountForHiringSession(s: { id: string; email: string; memberId: string | null }) {
  const select = { id: true, email: true, name: true, onboardingCompleted: true, twoFactorEnabled: true } as const;
  let f;
  if (!s.memberId) {
    const w = await prisma.jobBoardEmployer.findUnique({ where: { id: s.id }, select: { founderUserId: true } });
    if (!w?.founderUserId) return null;
    f = await prisma.founderUser.findFirst({ where: { id: w.founderUserId, deletedAt: null }, select });
  } else {
    f = await prisma.founderUser.findFirst({ where: { email: { equals: norm(s.email), mode: 'insensitive' }, deletedAt: null }, select });
  }
  // A hiring sign-in (password or email code) must never skip the founder's own two-step sign-in.
  if (!f || f.twoFactorEnabled) return null;
  return f;
}

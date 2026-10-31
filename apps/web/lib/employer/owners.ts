import { prisma } from '@udyaibase/database';

/**
 * Workspace ownership. Every owner, including the person whose email is the workspace's account email,
 * is an OWNER team-member row, so sign-in, notices and permissions work the same way for everyone.
 */

/** Account emails that are never a real inbox: Udyaibase's own placeholders and internal workspace addresses. */
export const INTERNAL_ACCOUNT_DOMAIN = 'workspace.udyaibase.invalid';
export function isRealInbox(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return !e.endsWith('@udyaibase.com') && !e.endsWith(`@${INTERNAL_ACCOUNT_DOMAIN}`) && !e.endsWith('.invalid');
}

/**
 * Account email for a founder's extra workspace: the account email is unique per workspace, so a founder's
 * second startup gets an internal address and the founder owns it through their OWNER row.
 */
export function internalAccountEmail(employerSlug: string): string {
  return `${employerSlug}.${Date.now().toString(36)}@${INTERNAL_ACCOUNT_DOMAIN}`;
}

/**
 * Make sure the workspace's account owner has an OWNER row (created on signup, founder workspaces and the
 * one-time backfill). Placeholder workspaces (admin-created, internal addresses) get none. Idempotent.
 */
export async function ensureOwnerMember(employerId: string, opts: { email?: string; name?: string | null } = {}) {
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: employerId },
    select: { email: true, passwordHash: true, companyName: true, FounderUser: { select: { name: true, email: true } } },
  });
  if (!e || e.passwordHash === '') return null;
  const email = (opts.email ?? e.email).trim().toLowerCase();
  if (!isRealInbox(email)) return null;
  const name = opts.name ?? (e.FounderUser?.email.toLowerCase() === email ? e.FounderUser.name : null);
  return prisma.jobBoardTeamMember.upsert({
    where: { employerId_email: { employerId, email } },
    create: { employerId, email, name, role: 'OWNER', status: 'ACTIVE', invitedByEmail: email, acceptedAt: new Date() },
    // An existing row (e.g. a pending invite or a recruiter) becomes an active owner.
    update: { role: 'OWNER', status: 'ACTIVE', jobIds: [], inviteTokenHash: null, inviteExpiresAt: null, ...(name ? { name } : {}) },
  });
}

/**
 * Refuses a change that would leave a workspace without an active owner, or that removes the account owner
 * (the person whose email the workspace was created with; they can be replaced only by changing the account email).
 */
export async function ownerChangeProblem(employerId: string, memberId: string, change: 'remove' | 'demote'): Promise<string | null> {
  const [member, e, owners] = await Promise.all([
    prisma.jobBoardTeamMember.findUnique({ where: { id: memberId }, select: { email: true, role: true, status: true } }),
    prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { email: true } }),
    prisma.jobBoardTeamMember.count({ where: { employerId, role: 'OWNER', status: 'ACTIVE' } }),
  ]);
  if (!member || member.role !== 'OWNER' || member.status !== 'ACTIVE') return null;
  if (e && member.email.toLowerCase() === e.email.toLowerCase()) {
    return change === 'remove'
      ? 'This is the workspace’s account owner. They can’t be removed; change the account email in Settings first.'
      : 'This is the workspace’s account owner, so they stay an Owner.';
  }
  if (owners <= 1) return 'A workspace needs at least one owner. Make someone else an Owner first.';
  return null;
}

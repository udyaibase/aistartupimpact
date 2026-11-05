import { SignJWT } from 'jose';
import { prisma } from '@udyaibase/database';

/**
 * Shared pieces of employer sign-in. Everyone signs in with an email code; password sign-in remains for
 * existing accounts until PASSWORD_SIGNIN_UNTIL. Account owners with two-step sign-in add their two-step code
 * after either method (verify-2fa route).
 */

export { PASSWORD_SIGNIN_UNTIL, passwordSignInOpen } from '@/lib/employer/sign-in-policy';

const CHALLENGE_SECRET = new TextEncoder().encode(process.env.EMPLOYER_JWT_SECRET || process.env.USER_JWT_SECRET!);

/** Short-lived token for the two-step step after a correct password or email code (checked by verify-2fa). */
export function twoFactorChallenge(employerId: string) {
  return new SignJWT({ userId: employerId, userType: 'employer', purpose: '2fa-challenge' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(CHALLENGE_SECRET);
}

/**
 * Hiring teams this email can enter: active memberships, plus invites not yet accepted that haven't expired
 * (entering the emailed code proves the address, so it accepts the invite).
 */
export function signInMemberships(email: string, opts: { includeDeactivatedOwners?: boolean } = {}) {
  const now = new Date();
  return prisma.jobBoardTeamMember.findMany({
    where: {
      email: email.trim().toLowerCase(),
      Employer: { isActive: true, deletedAt: null },
      OR: [
        { status: 'ACTIVE', Employer: { deactivatedAt: null } },
        { status: 'PENDING', inviteExpiresAt: { gt: now }, Employer: { deactivatedAt: null } },
        // Owners can bring back a workspace they deactivated by signing in (member-code route only).
        ...(opts.includeDeactivatedOwners ? [{ status: 'ACTIVE' as const, role: 'OWNER' as const, Employer: { deactivatedAt: { not: null } } }] : []),
      ],
    },
    include: { Employer: { select: { id: true, email: true, companyName: true, slug: true, plan: true, logoUrl: true, twoFactorEnabled: true, deactivatedAt: true } } },
    orderBy: { lastActiveAt: { sort: 'desc', nulls: 'last' } },
  });
}

/** The account owner of a workspace with two-step sign-in on: an email code alone must not let them in. */
export const needsTwoFactor = (m: { email: string; Employer: { email: string; twoFactorEnabled: boolean } }) =>
  m.Employer.twoFactorEnabled && m.Employer.email.toLowerCase() === m.email.toLowerCase();

/**
 * Other hiring teams the signed-in person can switch to without signing in again: their active memberships
 * (same email). Workspaces whose account owner uses two-step sign-in need a fresh sign-in, so they're left out.
 */
export async function otherWorkspaces(email: string, currentEmployerId: string) {
  const rows = await prisma.jobBoardTeamMember.findMany({
    where: { email: email.trim().toLowerCase(), status: 'ACTIVE', employerId: { not: currentEmployerId }, Employer: { isActive: true, deactivatedAt: null, deletedAt: null } },
    include: { Employer: { select: { id: true, email: true, companyName: true, logoUrl: true, twoFactorEnabled: true } } },
    orderBy: { lastActiveAt: { sort: 'desc', nulls: 'last' } },
    take: 20,
  });
  return rows.filter((m) => !needsTwoFactor(m)).map((m) => ({ employerId: m.employerId, companyName: m.Employer.companyName, role: m.role }));
}

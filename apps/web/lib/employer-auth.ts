import { jwtSecret } from '@/lib/jwt-secret';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@udyaibase/database';

// Without its own secret, employer sessions use a key derived from USER_JWT_SECRET (never an empty key, and never
// the user-session key itself, so a token for one portal can't be replayed in the other).
const JWT_SECRET = jwtSecret(
  process.env.EMPLOYER_JWT_SECRET || (process.env.USER_JWT_SECRET ? `employer-session:${process.env.USER_JWT_SECRET}` : undefined),
  'EMPLOYER_JWT_SECRET',
);

const COOKIE_NAME = 'employer_session';
const SESSION_EXPIRY_DAYS = 7;

export type EmployerRole = 'OWNER' | 'RECRUITER' | 'INTERVIEWER';

export interface EmployerSession {
  /** The hiring workspace (JobBoardEmployer) id. */
  id: string;
  /** The signed-in person's email: the workspace account, or the teammate. */
  email: string;
  companyName: string;
  slug: string;
  plan: string;
  onboardingCompleted: boolean;
  /** Set when a teammate (not the workspace account itself) is signed in. */
  memberId: string | null;
  memberName: string | null;
  role: EmployerRole;
  /** Interviewers limited to specific jobs; null = every job in the workspace. */
  jobIds: string[] | null;
  /** This sign-in's id (absent on sessions from before sign-out could end one). */
  sessionId?: string | null;
}

/** How many signed-out session ids to remember per person. Sessions expire after 7 days, so old ids never matter. */
const REVOKED_KEPT = 50;

/**
 * Create and set employer session cookie (JWT).
 */
export async function setEmployerSession(employer: {
  id: string;
  email: string;
  companyName: string;
  slug: string;
  plan: string;
  onboardingCompleted: boolean;
}, member?: { id: string; email: string }): Promise<void> {
  // Only who is signed in and which sign-in this is. Company name, plan and role are read fresh on every request,
  // so a rename or a plan change shows at once.
  const jwt = await new SignJWT({
    employerId: employer.id,
    email: member?.email ?? employer.email,
    ...(member ? { memberId: member.id } : {}),
    sid: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_DAYS}d`)
    .sign(JWT_SECRET);

  (await cookies()).set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

/** JWT `iat` has whole seconds, so the cut-off is stored rounded down (see sessionCutoff). */
export function issuedBefore(iat: number | undefined, cutoff: Date | null | undefined): boolean {
  if (!cutoff) return false;
  return (iat ?? 0) * 1000 < cutoff.getTime();
}

/** Now, rounded down to the second, so a session issued straight after this moment still counts as newer. */
export const sessionCutoff = (now = Date.now()) => new Date(Math.floor(now / 1000) * 1000);

/** The signed cookie's contents, or null when it is missing, forged or expired. */
async function readSessionToken() {
  try {
    const cookie = (await cookies()).get(COOKIE_NAME);
    if (!cookie?.value) return null;
    const { payload } = await jwtVerify(cookie.value, JWT_SECRET);
    if (typeof payload.employerId !== 'string') return null;
    return {
      employerId: payload.employerId,
      email: String(payload.email ?? ''),
      memberId: typeof payload.memberId === 'string' ? payload.memberId : null,
      sid: typeof payload.sid === 'string' ? payload.sid : null,
      iat: payload.iat,
    };
  } catch {
    return null;
  }
}

/**
 * Get current employer session from cookie.
 * Returns null if not authenticated.
 *
 * One database read per request: the workspace and (for a teammate) their membership together, and the layout,
 * the page and its guards all share that one read (`cache`). Everything except "who" comes from that read, never
 * from the cookie: removals, role changes, sign-outs, renames and plan changes all apply on the next request.
 */
export const getEmployerSession = cache(async (): Promise<EmployerSession | null> => {
  try {
    const token = await readSessionToken();
    if (!token) return null;

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: token.employerId },
      select: {
        isActive: true, deactivatedAt: true, sessionsValidAfter: true,
        companyName: true, slug: true, plan: true, onboardingCompleted: true,
        ...(token.memberId
          ? { TeamMembers: { where: { id: token.memberId, status: 'ACTIVE' as const }, select: { id: true, name: true, role: true, jobIds: true, sessionsValidAfter: true, revokedSessionIds: true } } }
          : {}),
      },
    });
    if (!employer || !employer.isActive || employer.deactivatedAt) return null;

    let memberId: string | null = null;
    let memberName: string | null = null;
    let role: EmployerRole = 'OWNER';
    let jobIds: string[] | null = null;
    if (token.memberId) {
      const member = (employer as { TeamMembers?: { id: string; name: string | null; role: EmployerRole; jobIds: string[]; sessionsValidAfter: Date | null; revokedSessionIds: string[] }[] }).TeamMembers?.[0];
      if (!member) return null;
      // Their own "sign out everywhere", or this sign-in was signed out. (The workspace password changing doesn't
      // sign teammates out: they sign in with their own email code.)
      if (issuedBefore(token.iat, member.sessionsValidAfter)) return null;
      if (token.sid && member.revokedSessionIds.includes(token.sid)) return null;
      memberId = member.id;
      memberName = member.name;
      role = member.role;
      if (member.role === 'INTERVIEWER' && member.jobIds.length > 0) jobIds = member.jobIds;
    } else if (issuedBefore(token.iat, employer.sessionsValidAfter)) {
      // Password sign-ins made before a password change, a deactivation or a sign-out no longer count.
      return null;
    }

    return {
      id: token.employerId,
      email: token.email,
      companyName: employer.companyName,
      slug: employer.slug,
      plan: employer.plan,
      // Teammates never go through the workspace's first-run setup.
      onboardingCompleted: memberId ? true : employer.onboardingCompleted,
      memberId,
      memberName,
      role,
      jobIds,
      sessionId: token.sid,
    };
  } catch {
    return null;
  }
});

/**
 * Ends sessions on the server, so a copied cookie stops working (deleting the cookie alone never did that).
 * - 'this': the sign-in behind the current cookie.
 * - 'all': every sign-in of this person, on every device.
 * Password sign-ins to the workspace account have no per-person record, so both scopes end all of them.
 * Never throws: signing out must always at least clear the cookie.
 */
export async function revokeEmployerSessions(scope: 'this' | 'all'): Promise<void> {
  try {
    const token = await readSessionToken();
    if (!token) return;
    if (!token.memberId) {
      await prisma.jobBoardEmployer.updateMany({ where: { id: token.employerId }, data: { sessionsValidAfter: new Date() } });
      return;
    }
    if (scope === 'all' || !token.sid) {
      await prisma.jobBoardTeamMember.updateMany({ where: { id: token.memberId, employerId: token.employerId }, data: { sessionsValidAfter: new Date(), revokedSessionIds: [] } });
      return;
    }
    const member = await prisma.jobBoardTeamMember.findFirst({ where: { id: token.memberId, employerId: token.employerId }, select: { revokedSessionIds: true } });
    if (!member || member.revokedSessionIds.includes(token.sid)) return;
    await prisma.jobBoardTeamMember.updateMany({
      where: { id: token.memberId },
      data: { revokedSessionIds: [...member.revokedSessionIds, token.sid].slice(-REVOKED_KEPT) },
    });
  } catch (e) {
    console.error('[employer sign-out] could not end the session on the server:', e instanceof Error ? e.message : 'unknown error');
  }
}

/**
 * Clear employer session cookie.
 */
export async function clearEmployerSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

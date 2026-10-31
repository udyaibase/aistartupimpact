import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@udyaibase/database';

const JWT_SECRET = new TextEncoder().encode(
  process.env.EMPLOYER_JWT_SECRET!
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
}

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
  const jwt = await new SignJWT({
    employerId: employer.id,
    email: member?.email ?? employer.email,
    ...(member ? { memberId: member.id } : {}),
    companyName: employer.companyName,
    slug: employer.slug,
    plan: employer.plan,
    onboardingCompleted: employer.onboardingCompleted,
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

/**
 * Get current employer session from cookie.
 * Returns null if not authenticated.
 */
export async function getEmployerSession(): Promise<EmployerSession | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    if (!cookie?.value) return null;

    const { payload } = await jwtVerify(cookie.value, JWT_SECRET);

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: payload.employerId as string },
      select: { isActive: true, deactivatedAt: true },
    });
    if (!employer || !employer.isActive || employer.deactivatedAt) return null;

    // Teammates: role and access come from the database on every request, so removals apply at once.
    let memberId: string | null = null;
    let memberName: string | null = null;
    let role: EmployerRole = 'OWNER';
    let jobIds: string[] | null = null;
    if (typeof payload.memberId === 'string') {
      const member = await prisma.jobBoardTeamMember.findFirst({
        where: { id: payload.memberId, employerId: payload.employerId as string, status: 'ACTIVE' },
        select: { id: true, name: true, role: true, jobIds: true },
      });
      if (!member) return null;
      memberId = member.id;
      memberName = member.name;
      role = member.role;
      if (member.role === 'INTERVIEWER' && member.jobIds.length > 0) jobIds = member.jobIds;
    }

    return {
      id: payload.employerId as string,
      email: payload.email as string,
      companyName: payload.companyName as string,
      slug: payload.slug as string,
      plan: payload.plan as string,
      onboardingCompleted: !!payload.onboardingCompleted,
      memberId,
      memberName,
      role,
      jobIds,
    };
  } catch {
    return null;
  }
}

/**
 * Require employer authentication.
 * Throws redirect if not authenticated.
 */
export async function requireEmployerAuth(): Promise<EmployerSession> {
  const session = await getEmployerSession();
  if (!session) {
    throw new Error('EMPLOYER_AUTH_REQUIRED');
  }
  return session;
}

/**
 * Clear employer session cookie.
 */
export async function clearEmployerSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

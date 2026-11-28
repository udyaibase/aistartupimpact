import { jwtSecret } from '@/lib/jwt-secret';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { sql } from '@/lib/db';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  slug: string;
  bio: string | null;
  twitter: string | null;
  linkedin: string | null;
  termsAcceptedAt: Date | null;
  onboardingCompleted: boolean;
}

export interface UserIds { userId: string; email: string; sessionId: string | null }

/**
 * The one check every website-user route makes on the sign-in cookie. A valid signature is not enough: the account
 * must still be open, and this sign-in must not have been ended ("sign out of other devices", a password change).
 * Routes that only verified the signature kept working for up to 7 days after a sign-out.
 * Returns the ids from the token, or null.
 */
export async function verifyUserToken(token: string | undefined | null): Promise<UserIds | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = typeof payload.userId === 'string' ? payload.userId : null;
    if (!userId) return null;
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
    const rows = await sql`
      SELECT u.id, u.email FROM "WebUser" u
      WHERE u.id = ${userId} AND u."isActive" = true AND u."deactivatedAt" IS NULL
        AND (${sessionId}::text IS NULL OR EXISTS (
          SELECT 1 FROM "WebUserSession" s WHERE s.id = ${sessionId} AND s."webUserId" = u.id AND s."expiresAt" > NOW()
        ))
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return { userId, email: String(rows[0].email), sessionId };
  } catch {
    return null;
  }
}

/** verifyUserToken for the current request's cookie. */
/**
 * For the few places that must recognise a site sign-in even when the account is deactivated (reactivating it, opening
 * a workspace from it): the cookie's signature AND its session record, without the "account is active" condition.
 *
 * The session record is what makes a password change, a sign-out or "sign out everywhere" take effect: all three
 * delete it. Checking only the signature let a copy of the cookie keep working for up to 7 days afterwards. A cookie
 * with no session id (issued before sessions had records) is refused here: there is nothing to revoke it by.
 * Returns the ids and the email from the token, or null.
 */
export async function verifyUserTokenSession(token: string | undefined | null): Promise<{ userId: string; email: string; sessionId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = typeof payload.userId === 'string' ? payload.userId : null;
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    if (!userId || !sessionId || !email) return null;
    const rows = await sql`
      SELECT 1 FROM "WebUserSession" WHERE id = ${sessionId} AND "webUserId" = ${userId} AND "expiresAt" > NOW() LIMIT 1
    `;
    return rows.length ? { userId, email, sessionId } : null;
  } catch {
    return null;
  }
}

export async function getUserIds(): Promise<UserIds | null> {
  return verifyUserToken((await cookies()).get('user-token')?.value);
}

/**
 * Server-side function to get the current user session
 * Use this in Server Components and Server Actions
 */
export async function getUserSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('user-token')?.value;

    if (!token) {
      return null;
    }

    // Verify JWT token
    const verified = await jwtVerify(token, JWT_SECRET);
    const payload = verified.payload as any;

    // Get user from database using raw SQL to avoid Prisma caching issues
    const users = await sql`
      SELECT
        id, email, name, avatar, slug, bio, twitter, linkedin,
        "isActive", "deactivatedAt", "termsAcceptedAt"::text as "termsAcceptedAt",
        "onboardingCompleted"
      FROM "WebUser"
      WHERE id = ${payload.userId}
      LIMIT 1
    `;

    if (users.length === 0 || !users[0].isActive || users[0].deactivatedAt) {
      return null;
    }

    if (payload.sessionId) {
      const sessions = await sql`
        SELECT id FROM "WebUserSession"
        WHERE id = ${payload.sessionId} AND "expiresAt" > NOW()
        LIMIT 1
      `;
      if (sessions.length === 0) return null;
    }

    const user = users[0];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      slug: user.slug,
      bio: user.bio,
      twitter: user.twitter,
      linkedin: user.linkedin,
      termsAcceptedAt: user.termsAcceptedAt ? new Date(user.termsAcceptedAt) : null,
      onboardingCompleted: user.onboardingCompleted ?? false,
    };
  } catch (error) {
    console.error('getUserSession error:', error);
    return null;
  }
}

/**
 * Check if user is authenticated (returns boolean)
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getUserSession();
  return session !== null;
}

export async function refreshUserToken(userId: string, sessionId: string) {
  const users = await sql`
    SELECT id, email, name, "onboardingCompleted"
    FROM "WebUser"
    WHERE id = ${userId}
    LIMIT 1
  `;
  if (users.length === 0) return;

  const user = users[0];
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    sessionId,
    onboardingCompleted: user.onboardingCompleted ?? false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set('user-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

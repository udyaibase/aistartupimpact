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

import { jwtSecret } from '@/lib/jwt-secret';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getUnifiedSession } from '@/lib/unified-auth';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';

const JWT_SECRET = jwtSecret(process.env.FOUNDER_JWT_SECRET, 'FOUNDER_JWT_SECRET');

const USER_JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export interface FounderSession {
  userId: string;
  email: string;
  name: string;
  onboardingCompleted: boolean;
}

const SESSION_DAYS = 7;

// Create JWT token. `sid` names the FounderSession row behind it: signing out deletes the row, and the token stops working.
export async function createFounderToken(userId: string, email: string, name: string, onboardingCompleted: boolean, sid?: string) {
  const token = await new SignJWT({ userId, email, name, onboardingCompleted, ...(sid ? { sid } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
  
  return token;
}

// Verify JWT token
export async function verifyFounderToken(token: string): Promise<FounderSession | null> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    return verified.payload as unknown as FounderSession;
  } catch (error) {
    return null;
  }
}

/** True when a token was issued before the account's sessions were last invalidated (a password change). */
function issuedBefore(iat: number | undefined, validAfter: Date | null): boolean {
  return !!validAfter && (iat ?? 0) < Math.floor(validAfter.getTime() / 1000);
}

/**
 * The founder signed in on this request, or null. Cached for the request: the portal layout, the page and the
 * helpers they call all ask, and each ask used to repeat the same two or three database lookups.
 */
export const getFounderSession = cache(readFounderSession);

async function readFounderSession(): Promise<FounderSession | null> {
  const cookieStore = await cookies();
  
  // 1. Try founder-token cookie (legacy)
  const token = cookieStore.get('founder-token')?.value;
  if (token) {
    const verified = await verifyFounderToken(token);
    if (verified) {
      const { sid, iat } = verified as FounderSession & { sid?: string; iat?: number };
      const founder = await prisma.founderUser.findUnique({
        where: { id: verified.userId },
        select: { status: true, deactivatedAt: true, deletedAt: true, sessionsValidAfter: true },
      });
      if (!founder || founder.status === 'SUSPENDED' || founder.deactivatedAt || founder.deletedAt) return null;
      if (issuedBefore(iat, founder.sessionsValidAfter)) return null;
      // Signed out (here or everywhere): the row is gone, so a copy of the cookie no longer works.
      // Cookies issued before session rows existed have no `sid`; they run out within 7 days of that release.
      if (sid && !(await prisma.founderSession.findFirst({ where: { id: sid, userId: verified.userId, expiresAt: { gt: new Date() } }, select: { id: true } }))) return null;
      return { userId: verified.userId, email: verified.email, name: verified.name, onboardingCompleted: verified.onboardingCompleted };
    }
  }
  
  // 2. Fallback: user-token cookie → find FounderUser by email
  const userToken = cookieStore.get('user-token')?.value;
  if (userToken) {
    try {
      const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
      const email = (payload as any).email;
      // The site session behind this cookie must still exist: signing out deletes it (getUserSession checks the same).
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
      const live = !sessionId || !!(await prisma.webUserSession.findFirst({ where: { id: sessionId, expiresAt: { gt: new Date() } }, select: { id: true } }));
      if (email && live) {
        const founder = await prisma.founderUser.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, email: true, name: true, onboardingCompleted: true, status: true, deactivatedAt: true, deletedAt: true, sessionsValidAfter: true },
        });
        if (founder && founder.status !== 'SUSPENDED' && !founder.deactivatedAt && !founder.deletedAt && !issuedBefore(payload.iat, founder.sessionsValidAfter)) {
          return {
            userId: founder.id,
            email: founder.email,
            name: founder.name,
            onboardingCompleted: founder.onboardingCompleted,
          };
        }
      }
    } catch {}
  }

  // 3. Fallback: unified session linked to a founder profile
  const unified = await getUnifiedSession().catch(() => null);
  if (unified?.founderId) {
    const founder = await prisma.founderUser.findUnique({
      where: { id: unified.founderId },
      select: { id: true, email: true, name: true, onboardingCompleted: true, status: true, deactivatedAt: true, deletedAt: true },
    });
    if (founder && founder.status !== 'SUSPENDED' && !founder.deactivatedAt && !founder.deletedAt) {
      return { userId: founder.id, email: founder.email, name: founder.name, onboardingCompleted: founder.onboardingCompleted };
    }
  }

  return null;
}

// Set founder session cookie
export async function setFounderSession(userId: string, email: string, name: string, onboardingCompleted: boolean) {
  const cookieStore = await cookies();
  // Replacing this browser's session (onboarding finished, password changed): the old row goes with it.
  const previous = cookieStore.get('founder-token')?.value;
  const previousSid = previous ? ((await verifyFounderToken(previous)) as (FounderSession & { sid?: string }) | null)?.sid : undefined;
  if (previousSid) await prisma.founderSession.deleteMany({ where: { id: previousSid, userId } });

  const sid = crypto.randomUUID();
  await prisma.founderSession.create({
    data: { id: sid, userId, token: sid, expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000) },
  });
  const token = await createFounderToken(userId, email, name, onboardingCompleted, sid);
  
  cookieStore.set('founder-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

// Clear founder session: ends it on the server, then removes the cookie.
export async function clearFounderSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('founder-token')?.value;
  const sid = token ? ((await verifyFounderToken(token)) as (FounderSession & { sid?: string }) | null)?.sid : undefined;
  if (sid) await prisma.founderSession.deleteMany({ where: { id: sid } }).catch(() => {});
  cookieStore.delete('founder-token');
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// Require founder authentication (use in server actions)
export async function requireFounderAuth(): Promise<FounderSession> {
  const session = await getFounderSession();
  
  if (!session) {
    throw new Error('Unauthorized - Please login');
  }
  
  return session;
}

// Generate verification token
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

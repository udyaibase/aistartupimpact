import { cookies } from 'next/headers';
import { getUnifiedSession } from '@/lib/unified-auth';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';

const JWT_SECRET = new TextEncoder().encode(
  process.env.FOUNDER_JWT_SECRET!
);

const USER_JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

export interface FounderSession {
  userId: string;
  email: string;
  name: string;
  onboardingCompleted: boolean;
}

// Create JWT token
export async function createFounderToken(userId: string, email: string, name: string, onboardingCompleted: boolean) {
  const token = await new SignJWT({ userId, email, name, onboardingCompleted })
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

// Get current founder session
export async function getFounderSession(): Promise<FounderSession | null> {
  const cookieStore = await cookies();
  
  // 1. Try founder-token cookie (legacy)
  const token = cookieStore.get('founder-token')?.value;
  if (token) {
    const session = await verifyFounderToken(token);
    if (session) {
      const founder = await prisma.founderUser.findUnique({
        where: { id: session.userId },
        select: { status: true, deactivatedAt: true, deletedAt: true, sessionsValidAfter: true },
      });
      if (!founder || founder.status === 'SUSPENDED' || founder.deactivatedAt || founder.deletedAt) return null;
      if (issuedBefore((session as FounderSession & { iat?: number }).iat, founder.sessionsValidAfter)) return null;
      return session;
    }
  }
  
  // 2. Fallback: user-token cookie → find FounderUser by email
  const userToken = cookieStore.get('user-token')?.value;
  if (userToken) {
    try {
      const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
      const email = (payload as any).email;
      if (email) {
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
  const token = await createFounderToken(userId, email, name, onboardingCompleted);
  const cookieStore = await cookies();
  
  cookieStore.set('founder-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

// Clear founder session
export async function clearFounderSession() {
  const cookieStore = await cookies();
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

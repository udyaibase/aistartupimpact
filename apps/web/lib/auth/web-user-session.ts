import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { randomBytes } from 'crypto';
import { jwtSecret } from '@/lib/jwt-secret';
import { sql } from '@/lib/db';
import { clientIp } from '@/lib/client-ip';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');
const WEEK = 7 * 24 * 60 * 60;

/**
 * Signs a job seeker / reader (WebUser) in: a 7-day session row plus the `user-token` cookie on `res`.
 * Callers must have proven who they are first (password, email code, Google).
 */
export async function startWebUserSession(
  req: NextRequest, res: NextResponse,
  user: { id: string; email: string; name: string; onboardingCompleted?: boolean | null },
): Promise<void> {
  const sessionId = randomBytes(16).toString('hex');
  const token = await new SignJWT({ userId: user.id, email: user.email, name: user.name, sessionId, onboardingCompleted: user.onboardingCompleted ?? false })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(JWT_SECRET);
  const expiresAt = new Date(Date.now() + WEEK * 1000);
  await sql`INSERT INTO "WebUserSession" (id, "webUserId", "refreshToken", "expiresAt", "ipAddress", "userAgent", "createdAt")
    VALUES (${sessionId}, ${user.id}, ${token}, ${expiresAt.toISOString()}, ${clientIp(req)}, ${req.headers.get('user-agent') || 'unknown'}, NOW())`;
  await sql`UPDATE "WebUser" SET "lastLoginAt" = NOW() WHERE id = ${user.id}`;
  res.cookies.set('user-token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: WEEK, path: '/' });
}

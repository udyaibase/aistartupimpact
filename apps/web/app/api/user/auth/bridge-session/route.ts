import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { SignJWT } from 'jose';
import { randomBytes } from 'crypto';
import { getFounderSession } from '@/lib/founder-auth';

export const dynamic = 'force-dynamic';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  return `${base}-${randomBytes(3).toString('hex')}`;
}

/**
 * POST /api/user/auth/bridge-session
 * Creates a WebUser session for a founder who just completed 2FA.
 * Uses the founder-token cookie for authentication — no client-provided IDs.
 */
export async function POST(request: NextRequest) {
  try {
    const founderSession = await getFounderSession();
    if (!founderSession) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const founders = await sql`
      SELECT id, email, name, avatar
      FROM "FounderUser"
      WHERE id = ${founderSession.userId}
      LIMIT 1
    `;

    if (founders.length === 0) {
      return NextResponse.json({ error: 'Founder not found' }, { status: 404 });
    }

    const founder = founders[0];

    let webUsers = await sql`
      SELECT id, email, name, avatar, slug, "onboardingCompleted"
      FROM "WebUser"
      WHERE email = ${founder.email.toLowerCase()}
      LIMIT 1
    `;

    if (webUsers.length === 0) {
      const newId = generateId();
      const slug = generateSlug(founder.name || founder.email.split('@')[0]);
      await sql`
        INSERT INTO "WebUser" (id, email, name, slug, avatar, "isActive", "lastLoginAt", "createdAt", "updatedAt")
        VALUES (${newId}, ${founder.email.toLowerCase()}, ${founder.name}, ${slug}, ${founder.avatar || null}, true, NOW(), NOW(), NOW())
        ON CONFLICT (email) DO NOTHING
      `;
      webUsers = await sql`
        SELECT id, email, name, avatar, slug, "onboardingCompleted" FROM "WebUser" WHERE email = ${founder.email.toLowerCase()} LIMIT 1
      `;
    }

    const user = webUsers[0];

    const sessionId = generateId();
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

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await sql`
      INSERT INTO "WebUserSession" (id, "webUserId", "refreshToken", "expiresAt", "ipAddress", "userAgent", "createdAt")
      VALUES (${sessionId}, ${user.id}, ${token}, ${expiresAt.toISOString()}, 'bridge', 'bridge', NOW())
    `;

    const response = NextResponse.json({ success: true });
    response.cookies.set('user-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Bridge session error:', error);
    return NextResponse.json({ error: 'Failed to bridge session' }, { status: 500 });
  }
}

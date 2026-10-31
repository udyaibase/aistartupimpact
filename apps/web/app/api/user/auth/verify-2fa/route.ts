import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { jwtVerify, SignJWT } from 'jose';
import { sql } from '@/lib/db';
import { verifyTOTPToken, decryptSecret, verifyBackupCode } from '@/lib/two-factor';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const CHALLENGE_SECRET = new TextEncoder().encode(process.env.USER_JWT_SECRET!);
const JWT_SECRET = new TextEncoder().encode(process.env.USER_JWT_SECRET!);

function generateId(): string {
  return randomBytes(16).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { challengeToken, token, isBackupCode } = await request.json();

    if (!challengeToken || !token) {
      return NextResponse.json({ error: 'Challenge token and verification code are required' }, { status: 400 });
    }

    let userId: string;
    let userType: string;

    try {
      const { payload } = await jwtVerify(challengeToken, CHALLENGE_SECRET);
      if (payload.purpose !== '2fa-challenge') {
        return NextResponse.json({ error: 'Invalid challenge token' }, { status: 400 });
      }
      userId = payload.userId as string;
      userType = (payload.userType as string) || 'webuser';
    } catch {
      return NextResponse.json({ error: 'Challenge expired. Please log in again.' }, { status: 401 });
    }

    if (userType === 'organizer') {
      return await verifyOrganizerAndCreateSession(userId, token, isBackupCode, request);
    }

    const users = await sql`
      SELECT id, email, name, avatar, slug, "twoFactorEnabled", "twoFactorSecret", "twoFactorBackupCodes", "onboardingCompleted"
      FROM "WebUser"
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (users.length === 0 || !users[0].twoFactorEnabled) {
      return NextResponse.json({ error: 'Invalid challenge' }, { status: 400 });
    }

    const user = users[0];
    let isValid = false;

    if (isBackupCode) {
      const codes = user.twoFactorBackupCodes || [];
      if (codes.length === 0) return NextResponse.json({ error: 'No backup codes available' }, { status: 400 });
      const idx = await verifyBackupCode(token, codes);
      if (idx >= 0) {
        isValid = true;
        const updated = [...codes];
        updated.splice(idx, 1);
        await sql`UPDATE "WebUser" SET "twoFactorBackupCodes" = ${updated} WHERE id = ${userId}`;
      }
    } else {
      if (!user.twoFactorSecret) return NextResponse.json({ error: '2FA secret not found' }, { status: 400 });
      const secret = decryptSecret(user.twoFactorSecret);
      isValid = verifyTOTPToken(token, secret);
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
    }

    const sessionId = generateId();
    const jwtToken = await new SignJWT({ userId: user.id, email: user.email, name: user.name, sessionId, onboardingCompleted: user.onboardingCompleted ?? false })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await sql`
      INSERT INTO "WebUserSession" (id, "webUserId", "refreshToken", "expiresAt", "ipAddress", "userAgent", "createdAt")
      VALUES (${sessionId}, ${user.id}, ${jwtToken}, ${expiresAt.toISOString()},
        ${clientIp(request)},
        ${request.headers.get('user-agent') || 'unknown'}, NOW())
    `;
    await sql`UPDATE "WebUser" SET "lastLoginAt" = NOW() WHERE id = ${user.id}`;

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, slug: user.slug },
    });

    response.cookies.set('user-token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error verifying 2FA:', error);
    return NextResponse.json({ error: 'Failed to verify 2FA code' }, { status: 500 });
  }
}

async function verifyOrganizerAndCreateSession(userId: string, token: string, isBackupCode: boolean, request: NextRequest) {
  const orgs = await sql`
    SELECT id, email, name, "twoFactorEnabled", "twoFactorSecret", "twoFactorBackupCodes"
    FROM "EventOrganizer"
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (orgs.length === 0 || !orgs[0].twoFactorEnabled) {
    return NextResponse.json({ error: 'Invalid challenge' }, { status: 400 });
  }

  const org = orgs[0];

  let isValid = false;
  if (isBackupCode) {
    const codes = org.twoFactorBackupCodes || [];
    const idx = await verifyBackupCode(token, codes);
    if (idx >= 0) {
      isValid = true;
      const updated = [...codes];
      updated.splice(idx, 1);
      await sql`UPDATE "EventOrganizer" SET "twoFactorBackupCodes" = ${updated} WHERE id = ${userId}`;
    }
  } else if (org.twoFactorSecret) {
    const secret = decryptSecret(org.twoFactorSecret);
    isValid = verifyTOTPToken(token, secret);
  }

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
  }

  await sql`UPDATE "EventOrganizer" SET "lastLoginAt" = NOW() WHERE id = ${userId}`;

  const { createOrganizerSession } = await import('@/lib/organizer-auth');
  await createOrganizerSession(org.id);

  const webUser = await ensureWebUser({ email: org.email as string, name: org.name as string });
  const sessionId = generateId();
  const jwtToken = await new SignJWT({ userId: webUser.id, email: webUser.email, name: webUser.name, sessionId, onboardingCompleted: webUser.onboardingCompleted ?? false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO "WebUserSession" (id, "webUserId", "refreshToken", "expiresAt", "ipAddress", "userAgent", "createdAt")
    VALUES (${sessionId}, ${webUser.id}, ${jwtToken}, ${expiresAt.toISOString()},
      ${clientIp(request)},
      ${request.headers.get('user-agent') || 'unknown'}, NOW())
  `;

  const response = NextResponse.json({
    success: true,
    user: { id: webUser.id, email: webUser.email, name: webUser.name },
  });

  response.cookies.set('user-token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}

async function ensureWebUser(account: { email: string; name: string }) {
  const existing = await sql`SELECT id, email, name, "onboardingCompleted" FROM "WebUser" WHERE email = ${account.email.toLowerCase()} LIMIT 1`;
  if (existing.length > 0) return existing[0];

  const id = generateId();
  const slug = account.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + randomBytes(3).toString('hex');
  await sql`INSERT INTO "WebUser" (id, email, name, slug, "isActive", "createdAt", "updatedAt") VALUES (${id}, ${account.email.toLowerCase()}, ${account.name}, ${slug}, true, NOW(), NOW()) ON CONFLICT (email) DO NOTHING`;
  const created = await sql`SELECT id, email, name, "onboardingCompleted" FROM "WebUser" WHERE email = ${account.email.toLowerCase()} LIMIT 1`;
  return created[0];
}

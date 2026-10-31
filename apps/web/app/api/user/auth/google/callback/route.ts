import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { sql } from '@/lib/db';
import { SignJWT } from 'jose';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI_USER || 'http://localhost:3000/api/user/auth/google/callback';
const JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  const random = randomBytes(3).toString('hex');
  return `${base}-${random}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state') || '/profile';
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL('/?error=oauth_cancelled', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/?error=oauth_failed', request.url));
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      console.error('Google OAuth: no access token received');
      return NextResponse.redirect(new URL('/?error=oauth_token_failed', request.url));
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const googleUser = await userInfoResponse.json();

    if (!googleUser.email) {
      return NextResponse.redirect(new URL('/?error=oauth_no_email', request.url));
    }

    const existingUsers = await sql`
      SELECT id, email, name, avatar, slug, "isActive", "onboardingCompleted"
      FROM "WebUser"
      WHERE email = ${googleUser.email.toLowerCase()}
      LIMIT 1
    `;

    let user;
    if (existingUsers.length === 0) {
      const newUserId = generateId();
      const newUserSlug = generateSlug(googleUser.name || googleUser.email.split('@')[0]);

      await sql`
        INSERT INTO "WebUser" (
          id, email, name, slug, avatar, "isActive", "lastLoginAt", "createdAt", "updatedAt"
        ) VALUES (
          ${newUserId},
          ${googleUser.email.toLowerCase()},
          ${googleUser.name || googleUser.email.split('@')[0]},
          ${newUserSlug},
          ${googleUser.picture || null},
          true,
          NOW(),
          NOW(),
          NOW()
        )
      `;

      user = {
        id: newUserId,
        email: googleUser.email.toLowerCase(),
        name: googleUser.name || googleUser.email.split('@')[0],
        avatar: googleUser.picture || null,
        slug: newUserSlug,
        isActive: true,
      };
    } else {
      user = existingUsers[0];
    }

    if (!user.isActive) {
      return NextResponse.redirect(new URL('/?error=account_deactivated', request.url));
    }

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
      INSERT INTO "WebUserSession" (
        id, "webUserId", "refreshToken", "expiresAt", "ipAddress", "userAgent", "createdAt"
      ) VALUES (
        ${sessionId},
        ${user.id},
        ${token},
        ${expiresAt.toISOString()},
        ${clientIp(request)},
        ${request.headers.get('user-agent') || 'unknown'},
        NOW()
      )
    `;

    await sql`
      UPDATE "WebUser"
      SET "lastLoginAt" = NOW()
      WHERE id = ${user.id}
    `;

    let redirectPath = '/profile';
    if (typeof state === 'string' && state.startsWith('/') && !state.startsWith('//')) {
      redirectPath = state;
    }
    const response = NextResponse.redirect(new URL(redirectPath, request.url));
    response.cookies.set('user-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Google OAuth callback error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.redirect(new URL('/?error=oauth_error', request.url));
  }
}

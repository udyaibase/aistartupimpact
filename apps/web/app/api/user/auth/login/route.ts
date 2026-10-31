import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { randomBytes } from 'crypto';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { loginSchema, validateInput } from '@/lib/validation';
import { securityAlertHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';

const CHALLENGE_SECRET = new TextEncoder().encode(process.env.USER_JWT_SECRET!);

export const dynamic = 'force-dynamic';
const JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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

function checkLockout(user: any): NextResponse | null {
  if (!user.lockedUntil) return null;

  const raw = String(user.lockedUntil);
  const lockExpiry = new Date(raw.includes('Z') ? raw : raw + 'Z');
  if (lockExpiry > new Date()) {
    const minutesLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
    return NextResponse.json({
      error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
    }, { status: 429 });
  }
  return null;
}

function buildLockoutResponse(user: any, newAttempts: number): NextResponse {
  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    const resetUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com'}/forgot-password`;
    sendEmailFireAndForget({
      to: user.email,
      subject: 'Security Alert — Failed Login Attempts',
      html: securityAlertHtml(user.name || 'User', newAttempts, LOCKOUT_MINUTES, resetUrl),
      type: 'security_alert',
    });

    return NextResponse.json({
      error: `Account locked for ${LOCKOUT_MINUTES} minutes due to too many failed attempts. A security alert has been sent to your email.`
    }, { status: 429 });
  }

  const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
  return NextResponse.json({
    error: `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before account lockout.`
  }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success: rateLimitSuccess, remaining } = await checkRateLimit(authRateLimit, identifier);
    if (!rateLimitSuccess) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
      );
    }

    // Input validation
    const body = await request.json();
    if (!body.turnstileToken) {
      return NextResponse.json({ error: 'CAPTCHA verification required. Please complete the challenge.' }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ error: 'Human verification failed. Please try again.' }, { status: 403 });
    }
    const validation = validateInput(loginSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers: { 'X-RateLimit-Remaining': remaining.toString() } }
      );
    }

    const { email, password } = validation.data;
    const emailLower = email.toLowerCase();

    // ─── Try WebUser first ───────────────────────────
    const webUsers = await sql`
      SELECT id, email, name, "passwordHash", avatar, slug, "isActive", "twoFactorEnabled",
             "failedLoginAttempts", "lockedUntil", "onboardingCompleted"
      FROM "WebUser"
      WHERE email = ${emailLower}
      LIMIT 1
    `;

    if (webUsers.length > 0) {
      const user = webUsers[0];

      if (!user.isActive) {
        return NextResponse.json({ error: 'Account is deactivated. Please contact support.' }, { status: 403 });
      }
      if (!user.passwordHash) {
        return NextResponse.json({ error: 'Please sign in with Google' }, { status: 400 });
      }

      const lockResponse = checkLockout(user);
      if (lockResponse) {
        if (new Date(String(user.lockedUntil) + (String(user.lockedUntil).includes('Z') ? '' : 'Z')) <= new Date()) {
          await sql`UPDATE "WebUser" SET "lockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE id = ${user.id}`;
        } else {
          return lockResponse;
        }
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        const newAttempts = (user.failedLoginAttempts || 0) + 1;
        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          await sql`UPDATE "WebUser" SET "failedLoginAttempts" = ${newAttempts}, "lockedUntil" = ${lockUntil.toISOString()}::timestamp WHERE id = ${user.id}`;
        } else {
          await sql`UPDATE "WebUser" SET "failedLoginAttempts" = ${newAttempts} WHERE id = ${user.id}`;
        }
        return buildLockoutResponse(user, newAttempts);
      }

      await sql`UPDATE "WebUser" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = ${user.id}`;

      if (user.twoFactorEnabled) {
        const challengeToken = await new SignJWT({ userId: user.id, userType: 'webuser', purpose: '2fa-challenge' })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(CHALLENGE_SECRET);
        return NextResponse.json({ success: false, requires2FA: true, challengeToken, userType: 'webuser' });
      }

      // Success — create session for WebUser
      return await createWebUserSession(user, request);
    }

    // ─── Try FounderUser ─────────────────────────────
    const founders = await sql`
      SELECT id, email, name, "passwordHash", avatar, status, "twoFactorEnabled", "emailVerified",
             "failedLoginAttempts", "lockedUntil"
      FROM "FounderUser"
      WHERE email = ${emailLower}
      LIMIT 1
    `;

    if (founders.length > 0) {
      const founder = founders[0];

      if (founder.status === 'SUSPENDED') {
        return NextResponse.json({ error: 'Account is suspended. Please contact support.' }, { status: 403 });
      }
      if (!founder.passwordHash) {
        return NextResponse.json({ error: 'Please sign in with Google' }, { status: 400 });
      }
      if (!founder.emailVerified) {
        return NextResponse.json({ error: 'Please verify your email first. Check your inbox.' }, { status: 403 });
      }

      const lockResponse = checkLockout(founder);
      if (lockResponse) {
        if (new Date(String(founder.lockedUntil) + (String(founder.lockedUntil).includes('Z') ? '' : 'Z')) <= new Date()) {
          await sql`UPDATE "FounderUser" SET "lockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE id = ${founder.id}`;
        } else {
          return lockResponse;
        }
      }

      const isValid = await bcrypt.compare(password, founder.passwordHash);
      if (!isValid) {
        const newAttempts = (founder.failedLoginAttempts || 0) + 1;
        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          await sql`UPDATE "FounderUser" SET "failedLoginAttempts" = ${newAttempts}, "lockedUntil" = ${lockUntil.toISOString()}::timestamp WHERE id = ${founder.id}`;
        } else {
          await sql`UPDATE "FounderUser" SET "failedLoginAttempts" = ${newAttempts} WHERE id = ${founder.id}`;
        }
        return buildLockoutResponse(founder, newAttempts);
      }

      await sql`UPDATE "FounderUser" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = ${founder.id}`;

      // 2FA check
      if (founder.twoFactorEnabled) {
        const challengeToken = await new SignJWT({ userId: founder.id, purpose: '2fa-challenge' })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(new TextEncoder().encode(process.env.FOUNDER_JWT_SECRET!));
        return NextResponse.json({ success: false, requires2FA: true, challengeToken });
      }

      // Founder doesn't have a WebUser — create one on the fly for unified session
      const webUser = await ensureWebUser(founder as any);
      return await createWebUserSession(webUser, request);
    }

    // ─── Try EventOrganizer ──────────────────────────
    const organizers = await sql`
      SELECT id, email, name, "passwordHash", avatar, status, "emailVerified", "twoFactorEnabled",
             "failedLoginAttempts", "lockedUntil"
      FROM "EventOrganizer"
      WHERE email = ${emailLower}
      LIMIT 1
    `;

    if (organizers.length > 0) {
      const organizer = organizers[0];

      if (organizer.status === 'SUSPENDED') {
        return NextResponse.json({ error: 'Account is suspended. Please contact support.' }, { status: 403 });
      }
      if (!organizer.passwordHash) {
        return NextResponse.json({ error: 'Please sign in with Google' }, { status: 400 });
      }

      const lockResponse = checkLockout(organizer);
      if (lockResponse) {
        if (new Date(String(organizer.lockedUntil) + (String(organizer.lockedUntil).includes('Z') ? '' : 'Z')) <= new Date()) {
          await sql`UPDATE "EventOrganizer" SET "lockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE id = ${organizer.id}`;
        } else {
          return lockResponse;
        }
      }

      const isValid = await bcrypt.compare(password, organizer.passwordHash);
      if (!isValid) {
        const newAttempts = (organizer.failedLoginAttempts || 0) + 1;
        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          await sql`UPDATE "EventOrganizer" SET "failedLoginAttempts" = ${newAttempts}, "lockedUntil" = ${lockUntil.toISOString()}::timestamp WHERE id = ${organizer.id}`;
        } else {
          await sql`UPDATE "EventOrganizer" SET "failedLoginAttempts" = ${newAttempts} WHERE id = ${organizer.id}`;
        }
        return buildLockoutResponse(organizer, newAttempts);
      }

      await sql`UPDATE "EventOrganizer" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = ${organizer.id}`;

      if (organizer.twoFactorEnabled) {
        const challengeToken = await new SignJWT({ userId: organizer.id, userType: 'organizer', purpose: '2fa-challenge' })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(CHALLENGE_SECRET);
        return NextResponse.json({ success: false, requires2FA: true, challengeToken, userType: 'organizer' });
      }

      // Organizer doesn't have a WebUser — create one for unified session
      const webUser = await ensureWebUser(organizer as any);
      return await createWebUserSession(webUser, request);
    }

    // ─── Nothing found ───────────────────────────────
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function ensureWebUser(account: { id: string; email: string; name: string; avatar?: string | null; passwordHash?: string | null }) {
  const existing = await sql`
    SELECT id, email, name, avatar, slug, "isActive"
    FROM "WebUser"
    WHERE email = ${account.email.toLowerCase()}
    LIMIT 1
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  const newId = generateId();
  const slug = generateSlug(account.name || account.email.split('@')[0]);

  await sql`
    INSERT INTO "WebUser" (id, email, name, slug, avatar, "passwordHash", "isActive", "lastLoginAt", "createdAt", "updatedAt")
    VALUES (${newId}, ${account.email.toLowerCase()}, ${account.name}, ${slug}, ${account.avatar || null}, ${account.passwordHash || null}, true, NOW(), NOW(), NOW())
    ON CONFLICT (email) DO NOTHING
  `;

  const created = await sql`
    SELECT id, email, name, avatar, slug, "isActive"
    FROM "WebUser"
    WHERE email = ${account.email.toLowerCase()}
    LIMIT 1
  `;

  return created[0];
}

async function createWebUserSession(user: any, request: NextRequest) {
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
    VALUES (
      ${sessionId}, ${user.id}, ${token}, ${expiresAt.toISOString()},
      ${clientIp(request)},
      ${request.headers.get('user-agent') || 'unknown'}, NOW()
    )
  `;

  await sql`UPDATE "WebUser" SET "lastLoginAt" = NOW() WHERE id = ${user.id}`;

  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, slug: user.slug },
  });

  response.cookies.set('user-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}

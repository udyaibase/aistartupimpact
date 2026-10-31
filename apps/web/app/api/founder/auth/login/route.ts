import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import { verifyPassword, setFounderSession } from '@/lib/founder-auth';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { loginSchema, validateInput } from '@/lib/validation';
import { securityAlertHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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

    const validated = validation.data;

    const users = await sql`
      SELECT id, email, name, "passwordHash", company, "emailVerified", status,
             "twoFactorEnabled", "onboardingCompleted", "failedLoginAttempts", "lockedUntil",
             "deactivatedAt"
      FROM "FounderUser"
      WHERE email = ${validated.email.toLowerCase()}
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const user = users[0];

    if (user.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Your account has been suspended. Please contact support.' }, { status: 403 });
    }

    if (user.lockedUntil) {
      const raw = String(user.lockedUntil);
      const lockExpiry = new Date(raw.includes('Z') ? raw : raw + 'Z');
      if (lockExpiry > new Date()) {
        const minutesLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
        return NextResponse.json({
          error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
        }, { status: 429 });
      }
      await sql`UPDATE "FounderUser" SET "lockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE id = ${user.id}`;
    }

    const isValid = await verifyPassword(validated.password, user.passwordHash);

    if (!isValid) {
      const newAttempts = (user.failedLoginAttempts || 0) + 1;

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        await sql`UPDATE "FounderUser" SET "failedLoginAttempts" = ${newAttempts}, "lockedUntil" = ${lockUntil.toISOString()}::timestamp WHERE id = ${user.id}`;

        const resetUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com'}/auth/forgot-password`;
        sendEmailFireAndForget({
          to: user.email,
          subject: 'Security Alert — Failed Login Attempts',
          html: securityAlertHtml(user.name || 'Founder', newAttempts, LOCKOUT_MINUTES, resetUrl),
          type: 'security_alert',
        });

        return NextResponse.json({
          error: `Account locked for ${LOCKOUT_MINUTES} minutes due to too many failed attempts. A security alert has been sent to your email.`
        }, { status: 429 });
      }

      await sql`UPDATE "FounderUser" SET "failedLoginAttempts" = ${newAttempts} WHERE id = ${user.id}`;
      const remaining_attempts = MAX_FAILED_ATTEMPTS - newAttempts;
      return NextResponse.json({
        error: `Invalid email or password. ${remaining_attempts} attempt${remaining_attempts !== 1 ? 's' : ''} remaining before account lockout.`
      }, { status: 401 });
    }

    await sql`UPDATE "FounderUser" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = ${user.id}`;

    if (!user.emailVerified) {
      return NextResponse.json(
        { error: 'Please verify your email first. Check your inbox for the verification link.' },
        { status: 403 }
      );
    }

    if (user.deactivatedAt) {
      return NextResponse.json({
        deactivated: true,
        deactivatedAt: user.deactivatedAt,
        message: 'Your account has been deactivated. Would you like to reactivate it?',
        reactivateUrl: '/api/founder/reactivate',
      });
    }

    if (user.twoFactorEnabled) {
      const { SignJWT } = await import('jose');
      const challengeToken = await new SignJWT({ userId: user.id, purpose: '2fa-challenge' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(process.env.FOUNDER_JWT_SECRET!));
      return NextResponse.json({
        requires2FA: true,
        challengeToken,
        message: 'Please enter your 2FA code',
      });
    }

    await sql`
      UPDATE "FounderUser"
      SET "lastLoginAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${user.id}
    `;

    await setFounderSession(user.id, user.email, user.name, !!user.onboardingCompleted);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company,
      }
    });

  } catch (error) {
    console.error('Founder login error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}

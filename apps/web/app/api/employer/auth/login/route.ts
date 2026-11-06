import { NextRequest, NextResponse } from 'next/server';
import { ensureOwnerMember } from '@/lib/employer/owners';
import { passwordSignInOpen, twoFactorChallenge } from '@/lib/employer/sign-in';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { FOUNDER_SSO_MARKER } from '@/lib/employer/founder-workspace';
import { CODE_ONLY_MARKER } from '@/lib/employer/owners';
import { setEmployerSession } from '@/lib/employer-auth';
import { securityAlertHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    if (!passwordSignInOpen()) {
      return NextResponse.json({ error: 'Password sign-in has ended. Sign in with a code sent to your email instead.', useCode: true }, { status: 410 });
    }
    const identifier = getClientIdentifier(request);
    const { success: allowed } = await checkRateLimit(authRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    if (!body.turnstileToken) {
      return NextResponse.json({ error: 'CAPTCHA verification required. Please complete the challenge.' }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ error: 'Human verification failed. Please try again.' }, { status: 403 });
    }
    const { email, password } = body;

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Find employer
    const employers = await sql`
      SELECT id, "companyName", slug, email, "passwordHash", plan, "isActive",
             "emailVerified", "failedLoginAttempts", "lockedUntil", "twoFactorEnabled",
             "deactivatedAt", "onboardingCompleted"
      FROM "JobBoardEmployer"
      WHERE email = ${email.toLowerCase().trim()}
      LIMIT 1
    `;

    if (employers.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const employer = employers[0] as any;

    // Workspaces opened from the founder portal have no password of their own.
    if (employer.passwordHash === FOUNDER_SSO_MARKER) {
      return NextResponse.json({ error: 'This account signs in with your founder account. Use “Continue with your founder account” below.', code: 'founder_sso' }, { status: 401 });
    }
    if (employer.passwordHash === CODE_ONLY_MARKER) {
      return NextResponse.json({ error: 'This account has no password. Sign in with a code sent to your email above.', code: 'code_only', useCode: true }, { status: 401 });
    }

    // Check if account is active
    if (!employer.isActive) {
      return NextResponse.json({ error: 'Account is suspended. Contact support.' }, { status: 403 });
    }

    // Check if account is locked
    if (employer.lockedUntil) {
      const lockExpiry = new Date(employer.lockedUntil + 'Z');
      if (lockExpiry > new Date()) {
        const minutesLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
        return NextResponse.json({
          error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
        }, { status: 429 });
      }
      // Lock expired — reset
      await sql`UPDATE "JobBoardEmployer" SET "lockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE id = ${employer.id}`;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, employer.passwordHash);

    if (!isValid) {
      const newAttempts = (employer.failedLoginAttempts || 0) + 1;

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        // Lock account
        const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        await sql`
          UPDATE "JobBoardEmployer"
          SET "failedLoginAttempts" = ${newAttempts}, "lockedUntil" = ${lockUntil.toISOString()}::timestamp
          WHERE id = ${employer.id}
        `;

        const resetUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com'}/employer/forgot-password`;
        sendEmailFireAndForget({
          to: employer.email,
          subject: 'Security Alert — Failed Login Attempts',
          html: securityAlertHtml(employer.companyName, newAttempts, LOCKOUT_MINUTES, resetUrl),
          type: 'security_alert',
        });

        return NextResponse.json({
          error: `Account locked for ${LOCKOUT_MINUTES} minutes due to too many failed attempts. A security alert has been sent to your email.`
        }, { status: 429 });
      }

      // Increment failed attempts
      await sql`UPDATE "JobBoardEmployer" SET "failedLoginAttempts" = ${newAttempts} WHERE id = ${employer.id}`;

      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      return NextResponse.json({
        error: `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before account lockout.`
      }, { status: 401 });
    }

    // ✅ Password correct — reset failed attempts + update last login
    // With two-step sign-in on, the counter also limits wrong codes, so only a finished sign-in may reset it.
    if (!employer.twoFactorEnabled) {
      await sql`
      UPDATE "JobBoardEmployer"
      SET "failedLoginAttempts" = 0, "lockedUntil" = NULL, "lastLoginAt" = NOW()
      WHERE id = ${employer.id}
    `;
    }

    if (employer.deactivatedAt) {
      return NextResponse.json({
        deactivated: true,
        deactivatedAt: employer.deactivatedAt,
        message: 'Your account has been deactivated. Would you like to reactivate it?',
        error: 'This workspace is deactivated. Sign in with an email code to reactivate it.',
        reactivateUrl: '/api/employer/reactivate',
      });
    }

    if (employer.twoFactorEnabled) {
      return NextResponse.json({ success: false, requires2FA: true, challengeToken: await twoFactorChallenge(employer.id) });
    }

    // Older accounts get their OWNER row on first sign-in (the backfill does the rest).
    await ensureOwnerMember(employer.id).catch((e) => console.error('[login] owner row', e));

    // Set session cookie
    await setEmployerSession({
      id: employer.id,
      email: employer.email,
      companyName: employer.companyName,
      slug: employer.slug,
      plan: employer.plan,
      onboardingCompleted: !!employer.onboardingCompleted,
    });

    return NextResponse.json({
      success: true,
      emailVerified: employer.emailVerified,
      onboardingCompleted: !!employer.onboardingCompleted,
      employer: { id: employer.id, companyName: employer.companyName, slug: employer.slug },
    });
  } catch (error: any) {
    console.error('[POST /api/employer/auth/login]', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

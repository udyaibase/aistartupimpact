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
import { logEmployerActivity } from '@/lib/workspace-activity';


export const dynamic = 'force-dynamic';
/** A real bcrypt hash of nothing anyone uses: compared against when there is no password to check. */
const DUMMY_HASH = bcrypt.hashSync('no-such-account', 12);
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

    // Every failed sign-in gets this one answer. Different answers for "no such account", "wrong password",
    // "locked" or "this account has no password" would let anyone check which emails have a hiring account.
    const denied = () => NextResponse.json(
      { error: 'That email and password don’t match. You can also sign in with a code sent to your email.', useCode: true },
      { status: 401 },
    );

    const employer = employers[0] as any;
    // No account, or one that never had a password (founder sign-in, code-only): still spend the time a real
    // password check takes, so the response time doesn't give the answer away either.
    if (!employer || employer.passwordHash === FOUNDER_SSO_MARKER || employer.passwordHash === CODE_ONLY_MARKER || !employer.passwordHash) {
      await bcrypt.compare(String(password), DUMMY_HASH);
      return denied();
    }

    // Locked after too many wrong passwords: no password is tried until the lock ends. The security alert email
    // (sent when the lock started) tells the real owner what happened.
    if (employer.lockedUntil) {
      const lockExpiry = new Date(employer.lockedUntil + 'Z');
      if (lockExpiry > new Date()) return denied();
      // Lock expired — reset
      await sql`UPDATE "JobBoardEmployer" SET "lockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE id = ${employer.id}`;
      employer.failedLoginAttempts = 0;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, employer.passwordHash);

    if (!isValid) {
      await logEmployerActivity(employer.id, 'sign_in_failed', { actor: { name: employer.companyName, email: employer.email }, request, metadata: { reason: 'wrong_password' } });
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
      } else {
        await sql`UPDATE "JobBoardEmployer" SET "failedLoginAttempts" = ${newAttempts} WHERE id = ${employer.id}`;
      }
      return denied();
    }

    // From here the password was right, so saying more about the account tells a stranger nothing.
    if (!employer.isActive) {
      return NextResponse.json({ error: 'Account is suspended. Contact support.' }, { status: 403 });
    }
    // An address nobody has confirmed must not become a session: other checks (switching teams) trust the
    // signed-in email. The email code confirms it and signs in.
    if (!employer.emailVerified) {
      return NextResponse.json({ error: 'Confirm your email first: sign in with a code sent to your email.', useCode: true }, { status: 403 });
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
      // A password alone never brings a workspace back: the email code sign-in does, and it keeps two-step sign-in.
      return NextResponse.json({
        deactivated: true,
        useCode: true,
        error: 'This workspace is deactivated. Sign in with an email code to reactivate it.',
      }, { status: 403 });
    }

    if (employer.twoFactorEnabled) {
      return NextResponse.json({ success: false, requires2FA: true, challengeToken: await twoFactorChallenge(employer.id) });
    }

    // Older accounts get their OWNER row on first sign-in (the backfill does the rest).
    await ensureOwnerMember(employer.id).catch((e) => console.error('[login] owner row', e));

    await logEmployerActivity(employer.id, 'signed_in', { actor: { name: employer.companyName, email: employer.email }, request, metadata: { method: 'password' } });
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

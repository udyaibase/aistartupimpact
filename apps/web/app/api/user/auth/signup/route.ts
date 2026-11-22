import { NextRequest, NextResponse } from 'next/server';
import { passwordProblem } from "@/lib/password-rules";
import { consumeVerifiedOtp } from '@/lib/otp';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { signupSchema, validateInput } from '@/lib/validation';
import { isDisposableEmail } from '@udyaibase/utils';
import { CURRENT_TERMS_VERSION } from '@/lib/terms-version';
import { startWebUserSession } from '@/lib/auth/web-user-session';
import { isJobSeekerPath } from '@/lib/jobs/candidate-account';
import { safeReturnPath } from '@/lib/safe-return';

export const dynamic = 'force-dynamic';
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

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success: rateLimitSuccess, remaining } = await checkRateLimit(authRateLimit, identifier);
    if (!rateLimitSuccess) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again in 15 minutes.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
      );
    }

    // Input validation
    const body = await request.json();
    // No bot check here: the sign-up code (required below, consumeVerifiedOtp) can only be requested after passing
    // one (/api/auth/otp/send). A Turnstile token works once, so checking the same token again here failed sign-up.
    const validation = validateInput(signupSchema, body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers: { 'X-RateLimit-Remaining': remaining.toString() } }
      );
    }

    const { email, password, name } = validation.data;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    if (isDisposableEmail(email)) {
      return NextResponse.json(
        { error: 'Disposable email addresses are not allowed. Please use a permanent email.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }
    const pwProblem = passwordProblem(password, email, 'mixed', name); if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain an uppercase letter' }, { status: 400 });
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain a lowercase letter' }, { status: 400 });
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain a number' }, { status: 400 });
    }

    // Check if user already exists
    const existingUsers = await sql`
      SELECT id FROM "WebUser"
      WHERE email = ${email.toLowerCase()}
      LIMIT 1
    `;

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // The email must have passed the emailed-code check (popup step 1) in the last 30 minutes.
    if (!(await consumeVerifiedOtp(email, 'signup'))) {
      return NextResponse.json({ error: 'Please verify your email with the code we sent first.' }, { status: 403 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const userId = generateId();
    const userSlug = generateSlug(name);
    
    await sql`
      INSERT INTO "WebUser" (
        id, email, "passwordHash", name, slug, "isActive", "createdAt", "updatedAt"
      ) VALUES (
        ${userId},
        ${email.toLowerCase()},
        ${passwordHash},
        ${name},
        ${userSlug},
        true,
        NOW(),
        NOW()
      )
    `;

    // Record the consent given on the form. The newsletter is a separate, optional choice.
    const signupEmail = email.toLowerCase();
    if (body.agreeToTerms === true) {
      await sql`UPDATE "WebUser" SET "termsAcceptedAt" = NOW(), "termsVersion" = ${CURRENT_TERMS_VERSION} WHERE id = ${userId}`;
    }
    if (body.subscribeNewsletter === true) {
      await sql`
        INSERT INTO "NewsletterSubscriber" (id, email, name, source, "isActive", "emailVerified", "subscribedAt")
        VALUES (gen_random_uuid(), ${signupEmail}, ${name}, 'signup', true, true, NOW())
        ON CONFLICT (email) DO UPDATE SET "isActive" = true, "unsubscribedAt" = NULL
      `.catch((err: unknown) => console.error('[signup] newsletter', err instanceof Error ? err.message : 'failed'));
    }

    // The emailed code (checked above) proves the address: past job applications sent with it can be linked.
    await sql`UPDATE "WebUser" SET "emailVerifiedAt" = NOW() WHERE id = ${userId}`;
    // Signing up from a job page: they're here for jobs, so skip the "what brings you here" step (as with job sign-in).
    let onboardingCompleted = false;
    if (typeof body.returnTo === 'string' && isJobSeekerPath(safeReturnPath(body.returnTo, '/'))) {
      await sql`UPDATE "WebUser" SET "onboardingCompleted" = true, "primaryIntent" = 'looking_for_jobs' WHERE id = ${userId}`;
      onboardingCompleted = true;
    }

    // Signed in straight away: they just proved the email and chose a password. (Logging in again here used to fail:
    // the security check token is single-use and sign-up had already spent it.)
    const res = NextResponse.json({
      success: true,
      signedIn: true,
      onboardingCompleted,
      message: 'Account created successfully',
      user: {
        id: userId,
        email: email.toLowerCase(),
        name: name,
        slug: userSlug,
      },
    });
    await startWebUserSession(request, res, { id: userId, email: signupEmail, name, onboardingCompleted });
    return res;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

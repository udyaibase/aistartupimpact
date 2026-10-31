import { NextRequest, NextResponse } from 'next/server';
import { consumeVerifiedOtp } from '@/lib/otp';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { signupSchema, validateInput } from '@/lib/validation';
import { isDisposableEmail } from '@udyaibase/utils';

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
    if (!body.turnstileToken) {
      return NextResponse.json({ error: 'CAPTCHA verification required. Please complete the challenge.' }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ error: 'Human verification failed. Please try again.' }, { status: 403 });
    }
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

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: userId,
        email: email.toLowerCase(),
        name: name,
        slug: userSlug,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

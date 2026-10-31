import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { prisma } from '@udyaibase/database';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
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
    const { success: allowed } = await checkRateLimit(authRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const { email, password, name, subscribeNewsletter } = body;
    if (!body.turnstileToken) {
      return NextResponse.json({ error: 'CAPTCHA verification required. Please complete the challenge.' }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ error: 'Human verification failed. Please try again.' }, { status: 403 });
    }

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // Validate email format
    if (typeof email !== 'string' || email.length > 255 || !email.includes('@') || !email.split('@')[1]?.includes('.')) {
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

    // Check if founder already exists
    const existingFounder = await prisma.founderUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingFounder) {
      return NextResponse.json(
        { error: 'Founder with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate verification token
    const verifyToken = randomBytes(32).toString('hex');

    // Create founder user in FounderUser table
    const founder = await prisma.founderUser.create({
      data: {
        id: generateId(),
        email: email.toLowerCase(),
        passwordHash,
        name,
        status: 'PENDING_VERIFICATION', // Require email verification
        emailVerified: false,
        verifyToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
      },
    });

    // Send verification email
    try {
      const { sendVerificationEmail } = await import('@/lib/founder-email');
      await sendVerificationEmail(founder.email, founder.name, verifyToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail the signup if email fails, user can resend later
    }

    // Add to newsletter subscribers if consent given
    if (subscribeNewsletter) {
      try {
        await prisma.$executeRaw`
          INSERT INTO "NewsletterSubscriber" (id, email, name, source, "isActive", "subscribedAt", tags)
          VALUES (${generateId()}, ${email.toLowerCase()}, ${name}, 'founder_signup', true, NOW(), '{"founder"}')
          ON CONFLICT (email) DO UPDATE SET "isActive" = true, source = COALESCE("NewsletterSubscriber".source, 'founder_signup')
        `;
      } catch (subError) {
        console.error('Failed to add newsletter subscriber:', subError);
        // Don't fail signup if subscriber insert fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Founder account created successfully. Please check your email to verify your account.',
      emailVerified: false, // Email verification required
      user: {
        id: founder.id,
        email: founder.email,
        name: founder.name,
        status: founder.status,
      },
    });
  } catch (error) {
    console.error('Founder signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

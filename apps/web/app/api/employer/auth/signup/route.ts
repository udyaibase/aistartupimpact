import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { setEmployerSession } from '@/lib/employer-auth';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { isDisposableEmail } from '@udyaibase/utils';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
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
    const { companyName, email, password, websiteUrl, industry, companySize } = body;

    // Validation
    if (!companyName?.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }
    if (!email?.trim() || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (isDisposableEmail(email)) {
      return NextResponse.json({ error: 'Disposable email addresses are not allowed. Please use a permanent email.' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
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

    // Check if email already exists
    const existing = await sql`
      SELECT id FROM "JobBoardEmployer" WHERE email = ${email.toLowerCase().trim()} LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    // Generate slug
    const baseSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    
    // Check slug uniqueness
    const slugCheck = await sql`
      SELECT id FROM "JobBoardEmployer" WHERE slug = ${baseSlug} LIMIT 1
    `;
    const slug = slugCheck.length > 0 ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create employer
    const result = await sql`
      INSERT INTO "JobBoardEmployer" (
        "id", "companyName", "slug", "email", "passwordHash",
        "websiteUrl", "industry", "companySize",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${companyName.trim()},
        ${slug},
        ${email.toLowerCase().trim()},
        ${passwordHash},
        ${websiteUrl || null},
        ${industry || null},
        ${companySize || null},
        NOW(), NOW()
      )
      RETURNING id, "companyName", slug, email, plan
    `;

    const employer = result[0] as any;

    // Set session cookie
    await setEmployerSession({
      id: employer.id,
      email: employer.email,
      companyName: employer.companyName,
      slug: employer.slug,
      plan: employer.plan,
      onboardingCompleted: false,
    });

    return NextResponse.json({
      success: true,
      employer: {
        id: employer.id,
        companyName: employer.companyName,
        slug: employer.slug,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/employer/auth/signup]', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}

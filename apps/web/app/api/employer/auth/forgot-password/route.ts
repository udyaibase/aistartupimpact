import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import crypto from 'crypto';
import { employerPasswordResetHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

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
    const { email } = body;

    if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const employers = await sql`
      SELECT id, "companyName" FROM "JobBoardEmployer"
      WHERE email = ${email.toLowerCase().trim()} AND "isActive" = true
      LIMIT 1
    `;

    if (employers.length === 0) {
      return NextResponse.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    const employer = employers[0] as any;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await sql`
      UPDATE "JobBoardEmployer"
      SET "resetToken" = ${resetToken}, "resetTokenExpiry" = ${resetTokenExpiry.toISOString()}::timestamp, "updatedAt" = NOW()
      WHERE id = ${employer.id}
    `;

    const siteUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com';
    const resetUrl = `${siteUrl}/employer/reset-password?token=${resetToken}`;

    sendEmailFireAndForget({
      to: email.toLowerCase().trim(),
      subject: 'Reset Your Password — Udyaibase',
      html: employerPasswordResetHtml(employer.companyName, resetUrl),
      type: 'password_reset',
    });

    return NextResponse.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } catch (error: any) {
    console.error('[POST /api/employer/auth/forgot-password]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import crypto from 'crypto';
import { otpEmailHtml } from '@udyaibase/utils';
import { sendEmail } from '@/lib/email/send';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_TTL_MINUTES = 10;

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success: allowed } = await checkRateLimit(authRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    // Per-address cooldown, so nobody can flood an inbox.
    const recent = await sql`
      SELECT EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int AS age FROM "EmailOtp"
      WHERE email = ${email} AND purpose = 'employer_signup'
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    const age = (recent[0] as { age: number } | undefined)?.age;
    if (age !== undefined && age < RESEND_COOLDOWN_SECONDS) {
      const retryAfter = RESEND_COOLDOWN_SECONDS - age;
      return NextResponse.json(
        { error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter },
        { status: 429 },
      );
    }

    // Only unverified employer accounts get a code. Same response otherwise, so this
    // endpoint can't be used to check which emails are registered or to spam strangers.
    const accounts = await sql`
      SELECT id FROM "JobBoardEmployer" WHERE email = ${email} AND "emailVerified" = false LIMIT 1
    `;
    if (accounts.length === 0) {
      return NextResponse.json({ success: true, message: 'Verification code sent', cooldown: RESEND_COOLDOWN_SECONDS });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await sql`DELETE FROM "EmailOtp" WHERE email = ${email} AND purpose = 'employer_signup'`;
    await sql`
      INSERT INTO "EmailOtp" (id, email, code, purpose, "expiresAt", "createdAt")
      VALUES (gen_random_uuid()::text, ${email}, ${hashedCode}, 'employer_signup', ${expiresAt.toISOString()}::timestamp, NOW())
    `;

    const sent = await sendEmail({
      to: email,
      subject: 'Your Verification Code — Udyaibase Employer Portal',
      html: otpEmailHtml(code, 'employer'),
      type: 'otp',
    });

    if (!sent.success) {
      console.error('[OTP Email Error]', sent.error);
      await sql`DELETE FROM "EmailOtp" WHERE email = ${email} AND purpose = 'employer_signup'`;
      return NextResponse.json(
        { error: "We couldn't send the verification email right now. Please try again in a few minutes or contact support." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, message: 'Verification code sent', cooldown: RESEND_COOLDOWN_SECONDS });
  } catch (error) {
    console.error('[POST /api/employer/auth/send-otp]', error);
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 });
  }
}

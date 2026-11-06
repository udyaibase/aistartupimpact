import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import crypto from 'crypto';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'auth/verify-otp', 'sensitive');
  if (limited) return limited;
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email?.trim() || !code?.trim()) {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
    }

    const hashedCode = crypto.createHash('sha256').update(code.trim()).digest('hex');

    // Find valid OTP
    const otps = await sql`
      SELECT id, attempts FROM "EmailOtp"
      WHERE email = ${email.toLowerCase().trim()}
        AND purpose = 'employer_signup'
        AND verified = false
        AND "expiresAt" > NOW()
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    if (otps.length === 0) {
      return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 });
    }

    const otp = otps[0] as any;

    // Check max attempts (3)
    if (otp.attempts >= 3) {
      await sql`DELETE FROM "EmailOtp" WHERE id = ${otp.id}`;
      return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
    }

    // Increment attempts
    await sql`UPDATE "EmailOtp" SET attempts = attempts + 1 WHERE id = ${otp.id}`;

    // Verify code
    const storedOtp = await sql`
      SELECT id FROM "EmailOtp"
      WHERE id = ${otp.id} AND code = ${hashedCode}
      LIMIT 1
    `;

    if (storedOtp.length === 0) {
      const remainingAttempts = 3 - (otp.attempts + 1);
      return NextResponse.json({
        error: `Invalid code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
      }, { status: 400 });
    }

    // Mark as verified
    await sql`UPDATE "EmailOtp" SET verified = true WHERE id = ${otp.id}`;

    // Mark employer as email verified
    await sql`
      UPDATE "JobBoardEmployer" SET "emailVerified" = true, "updatedAt" = NOW()
      WHERE email = ${email.toLowerCase().trim()}
    `;

    return NextResponse.json({ success: true, verified: true });
  } catch (error: any) {
    console.error('[POST /api/employer/auth/verify-otp]', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

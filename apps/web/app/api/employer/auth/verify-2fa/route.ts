import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';
import { setEmployerSession } from '@/lib/employer-auth';
import { verifyTOTPToken, decryptSecret, verifyBackupCode } from '@/lib/two-factor';
import { TWO_FACTOR_LOCKED_MESSAGE, clearTwoFactorFailures, isTwoFactorLocked, recordTwoFactorFailure } from '@/lib/auth/two-factor-attempts';
import { twoFactorRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { logEmployerActivity } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

const CHALLENGE_SECRET = new TextEncoder().encode(process.env.EMPLOYER_JWT_SECRET || process.env.USER_JWT_SECRET!);

export async function POST(request: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(twoFactorRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const { challengeToken, token, isBackupCode } = await request.json();

    if (!challengeToken || !token) {
      return NextResponse.json({ error: 'Challenge token and verification code are required' }, { status: 400 });
    }

    let userId: string;

    try {
      const { payload } = await jwtVerify(challengeToken, CHALLENGE_SECRET);
      if (payload.purpose !== '2fa-challenge') {
        return NextResponse.json({ error: 'Invalid challenge token' }, { status: 400 });
      }
      userId = payload.userId as string;
    } catch {
      return NextResponse.json({ error: 'Challenge expired. Please log in again.' }, { status: 401 });
    }

    const employers = await sql`
      SELECT id, "companyName", slug, email, plan, "twoFactorEnabled", "twoFactorSecret", "twoFactorBackupCodes", "onboardingCompleted"
      FROM "JobBoardEmployer"
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (employers.length === 0 || !employers[0].twoFactorEnabled) {
      return NextResponse.json({ error: 'Invalid challenge' }, { status: 400 });
    }

    if (await isTwoFactorLocked('employer', userId)) {
      return NextResponse.json({ error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
    }

    const employer = employers[0];
    let isValid = false;

    if (isBackupCode) {
      const codes = employer.twoFactorBackupCodes || [];
      if (codes.length === 0) {
        return NextResponse.json({ error: 'No backup codes available' }, { status: 400 });
      }
      const idx = await verifyBackupCode(token, codes);
      if (idx >= 0) {
        isValid = true;
        const updated = [...codes];
        updated.splice(idx, 1);
        await sql`UPDATE "JobBoardEmployer" SET "twoFactorBackupCodes" = ${updated} WHERE id = ${userId}`;
      }
    } else {
      if (!employer.twoFactorSecret) {
        return NextResponse.json({ error: '2FA secret not found' }, { status: 400 });
      }
      const secret = decryptSecret(employer.twoFactorSecret);
      isValid = verifyTOTPToken(token, secret);
    }

    if (!isValid) {
      await logEmployerActivity(employer.id, 'sign_in_failed', { actor: { name: employer.companyName, email: employer.email }, request, metadata: { reason: 'wrong_2fa_code' } });
      const locked = await recordTwoFactorFailure('employer', userId);
      return locked
        ? NextResponse.json({ error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 })
        : NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
    }

    await clearTwoFactorFailures('employer', userId);
    await sql`UPDATE "JobBoardEmployer" SET "lastLoginAt" = NOW() WHERE id = ${userId}`;
    await logEmployerActivity(employer.id, 'signed_in', { actor: { name: employer.companyName, email: employer.email }, request, metadata: { method: 'password_2fa' } });

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
      employer: { id: employer.id, companyName: employer.companyName, slug: employer.slug },
    });
  } catch (error) {
    console.error('Error verifying employer 2FA:', error);
    return NextResponse.json({ error: 'Failed to verify 2FA code' }, { status: 500 });
  }
}

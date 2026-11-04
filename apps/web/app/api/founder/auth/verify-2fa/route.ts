import { NextRequest, NextResponse } from 'next/server';
import { isTwoFactorOn, verifyAccountCode } from '@/lib/auth/account-two-factor';
import { TWO_FACTOR_LOCKED_MESSAGE, clearTwoFactorFailures, isTwoFactorLocked, recordTwoFactorFailure } from '@/lib/auth/two-factor-attempts';
import { twoFactorRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { logFounderSignIn, logFounderSignInFailed } from '@/lib/founder/activity';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';
import { setFounderSession } from '@/lib/founder-auth';

export const dynamic = 'force-dynamic';

const CHALLENGE_SECRET = new TextEncoder().encode(process.env.FOUNDER_JWT_SECRET!);

/**
 * POST /api/founder/auth/verify-2fa
 * Verify 2FA code during login
 */
export async function POST(request: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(twoFactorRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const body = await request.json();
    const { challengeToken, token, isBackupCode } = body;

    if (!challengeToken || !token) {
      return NextResponse.json(
        { error: 'Challenge token and verification code are required' },
        { status: 400 }
      );
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

    const users = await sql`
      SELECT id, email, name, company, "twoFactorEnabled", "twoFactorSecret", "twoFactorBackupCodes", "onboardingCompleted"
      FROM "FounderUser"
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'Invalid challenge' },
        { status: 400 }
      );
    }

    const user = users[0];

    if (!(await isTwoFactorOn(user.email))) {
      return NextResponse.json({ error: 'Two-factor sign-in is not on for this account' }, { status: 400 });
    }

    if (await isTwoFactorLocked('founder', user.id)) {
      return NextResponse.json({ error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
    }

    const isValid = await verifyAccountCode(user.email, token, !!isBackupCode);

    if (!isValid) {
      await logFounderSignInFailed(user.email, request, 'wrong_2fa_code');
      if (await recordTwoFactorFailure('founder', user.id)) {
        return NextResponse.json({ error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
      }
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    await sql`
      UPDATE "FounderUser"
      SET "lastLoginAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${userId}
    `;

    await clearTwoFactorFailures('founder', user.id);
    await setFounderSession(user.id, user.email, user.name, !!user.onboardingCompleted);
    await logFounderSignIn(user.email, request, 'password_2fa');

    return NextResponse.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        company: user.company,
      },
    });
  } catch (error) {
    console.error('Error verifying 2FA:', error);
    return NextResponse.json(
      { error: 'Failed to verify 2FA code' },
      { status: 500 }
    );
  }
}

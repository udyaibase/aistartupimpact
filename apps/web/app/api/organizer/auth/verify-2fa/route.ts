import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { createOrganizerSession } from '@/lib/organizer-auth';
import { CHALLENGE_COOKIE, readChallengeToken } from '@/lib/organizer-auth/challenge';
import { isTwoFactorOn, verifyAccountCode } from '@/lib/auth/account-two-factor';
import { checkRateLimit, getClientIdentifier, authRateLimit, twoFactorRateLimit } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success: rlOk } = await checkRateLimit(authRateLimit, identifier);
  if (!rlOk) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { token, isBackupCode } = body;
    // From the sign-in form, or (after Google sign-in) from the short-lived cookie set on the way back.
    const challengeToken = body.challengeToken || request.cookies.get(CHALLENGE_COOKIE)?.value;

    if (!challengeToken || !token) {
      return NextResponse.json({ success: false, error: 'Challenge token and verification code are required' }, { status: 400 });
    }

    const userId = await readChallengeToken(challengeToken);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Challenge expired. Please log in again.' }, { status: 401 });
    }

    // Per-account rate limit (prevents brute-force across rotating IPs)
    const { success: accountRlOk } = await checkRateLimit(twoFactorRateLimit, `2fa:${userId}`);
    if (!accountRlOk) {
      return NextResponse.json({ success: false, error: 'Too many 2FA attempts. Try again later.' }, { status: 429 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, status: true, deactivatedAt: true },
    });

    if (!organizer || organizer.status === 'SUSPENDED' || organizer.deactivatedAt || !(await isTwoFactorOn(organizer.email))) {
      return NextResponse.json({ success: false, error: 'Invalid challenge' }, { status: 400 });
    }

    const isValid = await verifyAccountCode(organizer.email, token, !!isBackupCode);

    if (!isValid) {
      await logOrganizerActivity(organizer.id, 'sign_in_failed', { actor: { name: organizer.name, email: organizer.email }, request, metadata: { reason: 'wrong_2fa_code' } });
      return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 401 });
    }
    await logOrganizerActivity(organizer.id, 'signed_in', { actor: { name: organizer.name, email: organizer.email }, request, metadata: { method: 'password_2fa' } });

    await prisma.eventOrganizer.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    await createOrganizerSession(organizer.id);

    const res = NextResponse.json({
      success: true,
      data: { id: organizer.id, name: organizer.name, email: organizer.email },
    });
    res.cookies.set(CHALLENGE_COOKIE, '', { path: '/api/organizer/auth', maxAge: 0 });
    return res;
  } catch (error) {
    console.error('Error verifying organizer 2FA:', error);
    return NextResponse.json({ success: false, error: 'Failed to verify 2FA code' }, { status: 500 });
  }
}

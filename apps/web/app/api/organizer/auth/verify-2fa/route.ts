import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@udyaibase/database';
import { createOrganizerSession } from '@/lib/organizer-auth';
import { verifyTOTPToken, decryptSecret, verifyBackupCode } from '@/lib/two-factor';
import { checkRateLimit, getClientIdentifier, authRateLimit, twoFactorRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const CHALLENGE_SECRET = new TextEncoder().encode(process.env.ORGANIZER_JWT_SECRET || process.env.USER_JWT_SECRET!);

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success: rlOk } = await checkRateLimit(authRateLimit, identifier);
  if (!rlOk) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  try {
    const { challengeToken, token, isBackupCode } = await request.json();

    if (!challengeToken || !token) {
      return NextResponse.json({ success: false, error: 'Challenge token and verification code are required' }, { status: 400 });
    }

    let userId: string;

    try {
      const { payload } = await jwtVerify(challengeToken, CHALLENGE_SECRET);
      if (payload.purpose !== '2fa-challenge') {
        return NextResponse.json({ success: false, error: 'Invalid challenge token' }, { status: 400 });
      }
      userId = payload.userId as string;
    } catch {
      return NextResponse.json({ success: false, error: 'Challenge expired. Please log in again.' }, { status: 401 });
    }

    // Per-account rate limit (prevents brute-force across rotating IPs)
    const { success: accountRlOk } = await checkRateLimit(twoFactorRateLimit, `2fa:${userId}`);
    if (!accountRlOk) {
      return NextResponse.json({ success: false, error: 'Too many 2FA attempts. Try again later.' }, { status: 429 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true,
        twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true,
      },
    });

    if (!organizer || !organizer.twoFactorEnabled) {
      return NextResponse.json({ success: false, error: 'Invalid challenge' }, { status: 400 });
    }

    let isValid = false;

    if (isBackupCode) {
      const codes = organizer.twoFactorBackupCodes || [];
      if (codes.length === 0) {
        return NextResponse.json({ success: false, error: 'No backup codes available' }, { status: 400 });
      }
      const idx = await verifyBackupCode(token, codes);
      if (idx >= 0) {
        isValid = true;
        const updated = [...codes];
        updated.splice(idx, 1);
        await prisma.eventOrganizer.update({
          where: { id: userId },
          data: { twoFactorBackupCodes: updated },
        });
      }
    } else {
      if (!organizer.twoFactorSecret) {
        return NextResponse.json({ success: false, error: '2FA secret not found' }, { status: 400 });
      }
      const secret = decryptSecret(organizer.twoFactorSecret);
      isValid = verifyTOTPToken(token, secret);
    }

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 401 });
    }

    await prisma.eventOrganizer.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    await createOrganizerSession(organizer.id);

    return NextResponse.json({
      success: true,
      data: { id: organizer.id, name: organizer.name, email: organizer.email },
    });
  } catch (error) {
    console.error('Error verifying organizer 2FA:', error);
    return NextResponse.json({ success: false, error: 'Failed to verify 2FA code' }, { status: 500 });
  }
}

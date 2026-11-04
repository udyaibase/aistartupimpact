import { NextRequest, NextResponse } from 'next/server';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { turnOffTwoFactor, twoFactorDisableCheck } from '@/lib/auth/account-two-factor';
import { TWO_FACTOR_LOCKED_MESSAGE, clearTwoFactorFailures, isTwoFactorLocked, recordTwoFactorFailure } from '@/lib/auth/two-factor-attempts';
import { checkRateLimit, getClientIdentifier, twoFactorRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(twoFactorRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ success: false, error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const session = await getOrganizerSession();
    if (!session) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    if (await isTwoFactorLocked('organizer', session.id)) {
      return NextResponse.json({ success: false, error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
    }

    const check = await twoFactorDisableCheck(session.email, await request.json());
    if (!check.ok) {
      if (check.wrongCode && (await recordTwoFactorFailure('organizer', session.id))) {
        return NextResponse.json({ success: false, error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
      }
      return check.response;
    }

    await clearTwoFactorFailures('organizer', session.id);
    await turnOffTwoFactor(session.email);
    return NextResponse.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    console.error('2FA disable error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to disable 2FA' }, { status: 500 });
  }
}

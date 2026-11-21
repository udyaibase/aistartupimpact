import { NextRequest, NextResponse } from 'next/server';
import { founderApi } from '@/lib/founder/api-session';
import { turnOffTwoFactor, twoFactorDisableCheck } from '@/lib/auth/account-two-factor';
import { TWO_FACTOR_LOCKED_MESSAGE, clearTwoFactorFailures, isTwoFactorLocked, recordTwoFactorFailure } from '@/lib/auth/two-factor-attempts';
import { checkRateLimit, getClientIdentifier, twoFactorRateLimit } from '@/lib/rate-limit';
import { logFounderActivity } from '@/lib/founder/activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(twoFactorRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ success: false, error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    if (await isTwoFactorLocked('founder', session.userId)) {
      return NextResponse.json({ success: false, error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
    }

    const check = await twoFactorDisableCheck(session.email, await request.json());
    if (!check.ok) {
      if (check.wrongCode && (await recordTwoFactorFailure('founder', session.userId))) {
        return NextResponse.json({ success: false, error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
      }
      return check.response;
    }

    await clearTwoFactorFailures('founder', session.userId);
    await turnOffTwoFactor(session.email);
    await logFounderActivity(session.userId, '2fa_disabled', { request });
    return NextResponse.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    console.error('2FA disable error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to disable 2FA' }, { status: 500 });
  }
}

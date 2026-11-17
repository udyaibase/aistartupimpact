import { NextRequest, NextResponse } from 'next/server';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { turnOffTwoFactor, twoFactorDisableCheck } from '@/lib/auth/account-two-factor';
import { TWO_FACTOR_LOCKED_MESSAGE, clearTwoFactorFailures, isTwoFactorLocked, recordTwoFactorFailure } from '@/lib/auth/two-factor-attempts';
import { checkRateLimit, getClientIdentifier, twoFactorRateLimit } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { sendEmailFireAndForget } from '@/lib/email/send';

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
    await logOrganizerActivity(session.id, '2fa_disabled', { actor: organizerActor(session), request });
    // In case it wasn't them.
    sendEmailFireAndForget({
      to: session.email,
      subject: 'Two-factor sign-in was turned off — Udyaibase',
      html: `<p>Two-factor sign-in was just turned off for your Udyaibase account.</p><p>If this was you, there is nothing to do. If it wasn't, change your password now and turn it back on.</p>`,
      type: 'security_alert',
    });
    return NextResponse.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    console.error('2FA disable error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to disable 2FA' }, { status: 500 });
  }
}

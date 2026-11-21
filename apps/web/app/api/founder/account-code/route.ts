import { NextRequest, NextResponse } from 'next/server';
import { founderApi } from '@/lib/founder/api-session';
import { accountActionKey, accountHasPassword, type AccountAction } from '@/lib/founder/account';
import { generateOTP } from '@/lib/action-otp';
import { accountActionOtpHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const LABELS: Record<AccountAction, string> = {
  deactivate: 'deactivate your account',
  delete: 'permanently delete your account',
};

/**
 * Emails a 6-digit code to confirm deactivating or deleting an account that has no password (Google sign-in).
 * Accounts with a password confirm with the password instead, so they get no code.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const { success: allowed } = await checkRateLimit(strictRateLimit, `account-code:${getClientIdentifier(request)}`);
    if (!allowed) return NextResponse.json({ success: false, error: 'Too many requests. Try again later.' }, { status: 429 });

    const { action } = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (action !== 'deactivate' && action !== 'delete') {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
    if (await accountHasPassword(session.email.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Confirm with your password instead.' }, { status: 400 });
    }

    const { code, token } = generateOTP(session.userId, accountActionKey(action));
    sendEmailFireAndForget({
      to: session.email,
      subject: 'Your Udyaibase security code',
      html: accountActionOtpHtml(LABELS[action], code),
      type: 'founder_account_otp',
    });
    return NextResponse.json({ success: true, otpToken: token });
  } catch (err) {
    console.error('[founder/account-code POST]', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}

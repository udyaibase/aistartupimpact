import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/user-session';
import { accountActionKey, accountHasPassword } from '@/lib/founder/account';
import { generateOTP } from '@/lib/action-otp';
import { accountActionOtpHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Emails a 6-digit code to confirm deleting a site account that has no password (Google sign-in). Deleting from
 * Profile also erases the person's founder account, so a signed-in browser alone must not be enough.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });

    const { success: allowed } = await checkRateLimit(strictRateLimit, `account-code:${getClientIdentifier(request)}`);
    if (!allowed) return NextResponse.json({ success: false, error: 'Too many requests. Try again later.' }, { status: 429 });

    const { action } = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (action !== 'delete') return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    if (await accountHasPassword(session.email.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Confirm with your password instead.' }, { status: 400 });
    }

    const { code, token } = generateOTP(session.id, accountActionKey('delete'));
    sendEmailFireAndForget({
      to: session.email,
      subject: 'Your Udyaibase security code',
      html: accountActionOtpHtml('permanently delete your account', code),
      type: 'account_otp',
    });
    return NextResponse.json({ success: true, otpToken: token });
  } catch (err) {
    console.error('[user/account-code POST]', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}

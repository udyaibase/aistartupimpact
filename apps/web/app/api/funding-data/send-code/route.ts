import { NextRequest, NextResponse } from 'next/server';
import { otpEmailHtml } from '@udyaibase/utils';
import { createOtp } from '@/lib/otp';
import { sendEmail } from '@/lib/email/send';
import { authRateLimit, checkRateLimit, emailCodeAllowed, getClientIdentifier } from '@/lib/rate-limit';
import { EMAIL_RE, normaliseEmail, OTP_PURPOSE } from '@/lib/funding/access';

export const dynamic = 'force-dynamic';

/** Step 1 of every funding download (free and paid): email a 6-digit code. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(authRateLimit, `funding-code:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!(await emailCodeAllowed(email, OTP_PURPOSE))) {
    return NextResponse.json({ error: 'Too many codes sent to this email. Try again in 15 minutes.' }, { status: 429 });
  }

  const { otp, error } = await createOtp(email, OTP_PURPOSE);
  if (!otp) return NextResponse.json({ error: error || 'Couldn’t create a code. Try again.' }, { status: 429 });
  const sent = await sendEmail({ to: email, subject: `${otp} is your Udyaibase verification code`, html: otpEmailHtml(otp), type: 'otp' });
  if (!sent.success) return NextResponse.json({ error: 'Couldn’t send the email. Check the address and try again.' }, { status: 502 });
  return NextResponse.json({ success: true, cooldown: 60 });
}

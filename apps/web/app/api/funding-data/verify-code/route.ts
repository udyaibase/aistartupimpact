import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/otp';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { EMAIL_RE, emailPass, normaliseEmail, OTP_PURPOSE } from '@/lib/funding/access';

export const dynamic = 'force-dynamic';

/** Step 2: check the code; returns a 30-minute email pass for the free PDF or checkout. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(apiRateLimit, `funding-verify:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 });

  const r = await verifyOtp(email, code, OTP_PURPOSE);
  if (!r.valid) return NextResponse.json({ error: r.error || 'Incorrect code.' }, { status: 400 });
  return NextResponse.json({ success: true, pass: emailPass(email), email });
}

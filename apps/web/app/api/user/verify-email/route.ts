import { NextRequest, NextResponse } from 'next/server';
import { createOtp, checkEmailCode } from '@/lib/otp';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { claimApplications, getCandidate, markEmailVerified } from '@/lib/jobs/candidate-account';
import { sendCandidateCode } from '@/lib/jobs/candidate-emails';

export const dynamic = 'force-dynamic';
const PURPOSE = 'web_verify_email';

/** A signed-in job seeker proves they own their account's email: { action: 'send' } then { action: 'verify', code }. */
export async function POST(req: NextRequest) {
  const me = await getCandidate();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { success } = await checkRateLimit(authRateLimit, `web-verify:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ error: 'Too many tries. Wait a few minutes.' }, { status: 429 });
  if (me.emailVerified) return NextResponse.json({ success: true, linked: await claimApplications(me) });
  const body = await req.json().catch(() => ({}));

  if (body.action === 'send') {
    const { otp, error } = await createOtp(me.email, PURPOSE);
    if (!otp) return NextResponse.json({ error: error || 'Couldn’t send a code. Try again shortly.' }, { status: 429 });
    sendCandidateCode({ to: me.email, code: otp, purpose: 'verify' });
    return NextResponse.json({ success: true });
  }
  if (body.action === 'verify') {
    const code = String(body.code ?? '').trim();
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
    const check = await checkEmailCode(me.email, PURPOSE, code, { whenSpent: 'delete' });
    if (!check.ok) return NextResponse.json({ error: check.reason === 'wrong' ? `That code isn’t right. ${check.left} ${check.left === 1 ? 'try' : 'tries'} left.` : 'That code has expired. Send a new one.' }, { status: 400 });
    await markEmailVerified(me.id);
    return NextResponse.json({ success: true, linked: await claimApplications({ ...me, emailVerified: true }) });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

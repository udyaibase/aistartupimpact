import { NextRequest, NextResponse } from 'next/server';
import { founderApi } from '@/lib/founder/api-session';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { checkDomainCode, sendDomainCode } from '@/lib/startups/domain-otp';
import { founderAlreadyOwnsEmail, isPlausibleEmail, normalizeEmail, signContactEmailProof } from '@/lib/startups/contact-email';

export const dynamic = 'force-dynamic';

/**
 * Confirm a startup's private contact email before the startup is saved.
 * Body: { step: 'check', email } (no email sent), { step: 'send', email }, then { step: 'verify', email, code }.
 * Returns { confirmed: true, proof } once proven; the founder's own verified email is confirmed straight away.
 */
export async function POST(request: NextRequest) {
  const guard = await founderApi();
  if (guard.error) return guard.error;
  const session = guard.session;

  const body = await request.json().catch(() => ({}));
  const step = body.step === 'verify' ? 'verify' : body.step === 'check' ? 'check' : 'send';
  const email = normalizeEmail(body.email);
  if (!isPlausibleEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.', field: 'email' }, { status: 400 });

  if (await founderAlreadyOwnsEmail(session.userId, email)) {
    return NextResponse.json({ confirmed: true, proof: await signContactEmailProof(session.userId, email) });
  }
  if (step === 'check') return NextResponse.json({ confirmed: false });

  // One code "slot" per founder, so changing the address replaces the previous code.
  const purpose = `startup_contact:${session.userId}`;

  if (step === 'send') {
    const { success: allowed } = await checkRateLimit(authRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    const r = await sendDomainCode({
      email, purpose, startupName: 'your startup', requester: session.name || 'A founder', account: `founder:${session.userId}`,
      copy: {
        subject: 'Your code to confirm your startup contact email',
        heading: 'Confirm your contact email',
        intro: `${session.name || 'A founder'} added this address as the private contact email for a startup on Udyaibase. Enter this code to confirm it:`,
      },
    });
    if (!r.ok) return NextResponse.json({ error: r.error, retryAfter: r.retryAfter }, { status: r.status });
    return NextResponse.json({ sent: true, cooldown: r.cooldown });
  }

  const { success: mayTry } = await checkRateLimit(authRateLimit, `contact-verify:${session.userId}`);
  if (!mayTry) return NextResponse.json({ error: 'Too many attempts. Please try again in 15 minutes.' }, { status: 429 });
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code from the email.' }, { status: 400 });
  const r = await checkDomainCode({ email, purpose, code });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  return NextResponse.json({ confirmed: true, proof: await signContactEmailProof(session.userId, email) });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getFounderSession } from '@/lib/founder-auth';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { emailDomain, emailMatchesDomain, isFreeMailDomain, websiteDomain } from '@/lib/jobs/trust';
import { checkDomainCode, sendDomainCode } from '@/lib/startups/domain-otp';
import { markStartupVerified } from '@/lib/startups/ownership';

export const dynamic = 'force-dynamic';

/**
 * Verify startup ownership with a code sent to a work email on the startup's website domain.
 * The faster alternative to the DNS record; both end in the same verified state.
 * Body: { step: 'send', email } then { step: 'verify', email, code }.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getFounderSession();
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const step = body.step === 'verify' ? 'verify' : 'send';
  const email = String(body.email ?? '').trim().toLowerCase();

  const startup = await prisma.startup.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, websiteUrl: true, ownerId: true, isVerified: true },
  });
  if (!startup) return NextResponse.json({ error: 'Startup not found.' }, { status: 404 });
  if (startup.isVerified && startup.ownerId && startup.ownerId !== session.userId) {
    return NextResponse.json({ error: `${startup.name} is already verified by another founder. Ask them to add you to their team.` }, { status: 409 });
  }

  const companyDomain = websiteDomain(startup.websiteUrl);
  if (!companyDomain) {
    return NextResponse.json({ error: `${startup.name} has no website on file, so it can't be verified by email. Use the DNS method or contact support.` }, { status: 422 });
  }
  const domain = emailDomain(email);
  if (!domain) return NextResponse.json({ error: 'Enter a valid work email.', field: 'email' }, { status: 400 });
  if (isFreeMailDomain(domain)) {
    return NextResponse.json({ error: `Use your work email at ${companyDomain}, not a personal address.`, field: 'email' }, { status: 400 });
  }
  if (!emailMatchesDomain(email, companyDomain)) {
    return NextResponse.json({ error: `The email must be on ${companyDomain}, the domain of ${startup.name}'s website.`, field: 'email' }, { status: 400 });
  }

  const purpose = `founder_claim:${startup.id}`;

  if (step === 'send') {
    const { success: allowed } = await checkRateLimit(authRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    const r = await sendDomainCode({ email, purpose, startupName: startup.name, requester: session.name || 'A founder' });
    if (!r.ok) return NextResponse.json({ error: r.error, retryAfter: r.retryAfter }, { status: r.status });
    return NextResponse.json({ success: true, companyDomain, cooldown: r.cooldown });
  }

  const code = String(body.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code from the email.' }, { status: 400 });
  const r = await checkDomainCode({ email, purpose, code });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  await markStartupVerified(prisma, startup.id, companyDomain, session.userId);
  return NextResponse.json({ success: true, startup: { id: startup.id, name: startup.name } });
}

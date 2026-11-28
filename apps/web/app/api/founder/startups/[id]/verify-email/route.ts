import { onStartupVerified } from '@/lib/offers/claim';
import { founderAtStartupLimit, STARTUP_LIMIT_MESSAGE } from '@/lib/founder/limits';
import { logFounderActivity } from '@/lib/founder/activity';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { founderApi } from '@/lib/founder/api-session';
import { clientIp } from '@/lib/client-ip';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { emailDomain, emailMatchesDomain, isFreeMailDomain } from '@/lib/jobs/trust';
import { checkDomainCode, sendDomainCode } from '@/lib/startups/domain-otp';
import { markStartupVerified } from '@/lib/startups/ownership';
import { emailVerificationDomain } from '@/lib/startups/listing-domain';
import { isPlatformHosted, isPlatformPage } from '@udyaibase/utils';
import { refreshPublicListing } from '@/lib/founder/refresh-listing';

export const dynamic = 'force-dynamic';

/**
 * Verify startup ownership with a code sent to a work email on the startup's website domain.
 * The faster alternative to the DNS record; both end in the same verified state.
 * Body: { step: 'send', email } then { step: 'verify', email, code }.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await founderApi();
  if (guard.error) return guard.error;
  const session = guard.session;

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

  if (startup.ownerId !== session.userId && (await founderAtStartupLimit(session.userId, id))) {
    return NextResponse.json({ error: STARTUP_LIMIT_MESSAGE }, { status: 400 });
  }

  const companyDomain = emailVerificationDomain(startup.websiteUrl);
  if (!companyDomain && startup.websiteUrl && (isPlatformPage(startup.websiteUrl) || isPlatformHosted(startup.websiteUrl))) {
    return NextResponse.json({ error: `${startup.name}'s website is a page on a shared platform, so an email can't prove ownership. Add your own domain as the website, or contact support.` }, { status: 422 });
  }
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
    const r = await sendDomainCode({ email, purpose, startupName: startup.name, requester: session.name || 'A founder', account: `founder:${session.userId}` });
    if (!r.ok) return NextResponse.json({ error: r.error, retryAfter: r.retryAfter }, { status: r.status });
    return NextResponse.json({ success: true, companyDomain, cooldown: r.cooldown });
  }

  // Guesses are limited per founder and startup as well as per code, so asking for fresh codes doesn't buy more tries.
  const { success: mayTry } = await checkRateLimit(authRateLimit, `claim-verify:${session.userId}:${startup.id}`);
  if (!mayTry) return NextResponse.json({ error: 'Too many attempts. Please try again in 15 minutes.' }, { status: 429 });
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code from the email.' }, { status: 400 });
  const r = await checkDomainCode({ email, purpose, code });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  await markStartupVerified(prisma, startup.id, companyDomain, session.userId, {
    method: 'EMAIL', email, ipAddress: clientIp(request), userAgent: request.headers.get('user-agent'),
  });
  await refreshPublicListing('startup', startup.id); // verified badge
  await logFounderActivity(session.userId, 'startup_claim_verified', { request, metadata: { startupId: startup.id, method: 'email' } });
  await onStartupVerified(startup.id, session.userId); // a running verified-founder offer
  return NextResponse.json({ success: true, startup: { id: startup.id, name: startup.name } });
}

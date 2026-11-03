import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { authRateLimit, checkRateLimit, companyCreateRateLimit, emailCodeAllowed, getClientIdentifier } from '@/lib/rate-limit';
import { checkDomainCode } from '@/lib/startups/domain-otp';
import { isDisposableEmail } from '@udyaibase/utils';
import {
  addCompany, companyOptions, continueToTeam, createWorkspace, requestToJoin, searchStartups, sendSignupCode,
  setSignupPass, signupEmail, SIGNUP_PURPOSE,
} from '@/lib/employer/signup';
import { prisma } from '@udyaibase/database';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const err = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

/**
 * Passwordless employer signup, one action per step:
 * - code { email, turnstileToken }      → emails a 6-digit code
 * - verify { email, code }              → sets the signed "verified email" pass; returns company options
 * - options                              → company options again (pass required)
 * - search { q }                         → startups by name (pass required)
 * - workspace { startupId }              → join request if the startup already hires here, else a new workspace
 * - company { name, websiteUrl }         → add a company that isn't listed, then its workspace
 * - continue { employerId }              → enter a team this person is already on
 */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(authRateLimit, `signup:${getClientIdentifier(request)}`);
  if (!success) return err('Too many attempts. Try again in a few minutes.', 429);
  const b = await request.json().catch(() => ({}));

  if (b.action === 'code') {
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return err('Enter a valid email address.');
    if (isDisposableEmail(email)) return err('Use your work email, not a temporary address.');
    if (!b.turnstileToken || !(await verifyTurnstileToken(b.turnstileToken))) return err('Please complete the check that you’re human.', 403);
    if (!(await emailCodeAllowed(email, SIGNUP_PURPOSE))) return err('Too many codes requested for this email. Try again in 15 minutes.', 429);
    const sent = await sendSignupCode(email);
    return sent.ok ? NextResponse.json({ success: true }) : err(sent.error, sent.status);
  }

  if (b.action === 'verify') {
    const email = String(b.email ?? '').trim().toLowerCase();
    const code = String(b.code ?? '').replace(/\D/g, '');
    if (!EMAIL_RE.test(email) || code.length !== 6) return err('Enter the 6-digit code from the email.');
    const r = await checkDomainCode({ email, purpose: SIGNUP_PURPOSE, code });
    if (!r.ok) return err(r.error, r.status);
    await setSignupPass(email);
    return NextResponse.json({ success: true, ...(await companyOptions(email)) });
  }

  // Every later step needs the pass from a verified code.
  const email = await signupEmail();
  if (!email) return err('Your session timed out. Enter your email again.', 401, { restart: true });

  if (b.action === 'options') return NextResponse.json({ success: true, ...(await companyOptions(email)) });
  if (b.action === 'search') return NextResponse.json({ success: true, results: await searchStartups(String(b.q ?? '')) });

  if (b.action === 'continue') {
    const r = await continueToTeam(email, String(b.employerId ?? ''));
    return 'error' in r ? err(r.error!) : NextResponse.json({ success: true, redirect: r.redirect });
  }

  if (b.action === 'workspace') {
    const startup = await prisma.startup.findFirst({
      where: { id: String(b.startupId ?? ''), deletedAt: null },
      select: { id: true, name: true, logoUrl: true, websiteUrl: true, headquartersCity: true, tagline: true },
    });
    if (!startup) return err('Choose your company.');
    // Already hires here: join (accept an invite) or ask the owners. Otherwise a new workspace below.
    const joined = await requestToJoin(email, startup.id);
    if ('error' in joined && joined.error) return err(joined.error, 409, { signIn: !!joined.signIn });
    if ('joined' in joined) return NextResponse.json({ success: true, joined: true, company: joined.company, redirect: '/employer/dashboard' });
    if ('requested' in joined) return NextResponse.json({ success: true, requested: true, company: joined.company });
    const { success: canCreate } = await checkRateLimit(companyCreateRateLimit, `ws:${email}`);
    if (!canCreate) return err('You created a workspace recently. Try again tomorrow, or contact us.', 429);
    const created = await createWorkspace(email, startup, { name: startup.name, websiteUrl: startup.websiteUrl });
    return NextResponse.json({ success: true, created: true, employerId: created.employerId, redirect: '/employer/jobs/new?welcome=1' });
  }

  if (b.action === 'company') {
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 2) return err('Enter your company name.', 400, { field: 'name' });
    const { success: canCreate } = await checkRateLimit(companyCreateRateLimit, `ws:${email}`);
    if (!canCreate) return err('You added a company recently. Try again tomorrow, or contact us.', 429);
    const r = await addCompany(email, name, String(b.websiteUrl ?? ''));
    if ('error' in r && r.error) return err(r.error, 400, { field: r.field });
    if ('existing' in r) return NextResponse.json({ success: true, existing: r.existing });
    return NextResponse.json({ success: true, created: true, redirect: '/employer/jobs/new?welcome=1' });
  }

  return err('Unknown step.');
}

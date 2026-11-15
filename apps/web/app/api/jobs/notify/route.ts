import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { careersSubscribeRateLimit } from '@/lib/event-rate-limit';
import { getCareersCompany } from '@/lib/jobs/careers';
import { normalizeEmail, subscribeToCareers } from '@/lib/jobs/careers-subscribers';

export const dynamic = 'force-dynamic';

/** "Get notified when {company} is hiring" (careers widget and company page). Sends a confirmation email. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(careersSubscribeRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many sign-ups from this network. Please try again later.' }, { status: 429 });

  const b = await request.json().catch(() => ({}));
  // Hidden field people never fill in.
  if (typeof b.website === 'string' && b.website) return NextResponse.json({ success: true });
  const email = normalizeEmail(b.email);
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.', field: 'email' }, { status: 400 });
  if (b.consent !== true) return NextResponse.json({ error: 'Tick the box to agree to these emails.', field: 'consent' }, { status: 400 });
  const slug = typeof b.company === 'string' ? b.company.slice(0, 120) : '';
  const company = slug ? await getCareersCompany({ slug }) : null;
  if (!company) return NextResponse.json({ error: 'This company page is no longer available.' }, { status: 404 });

  try {
    await subscribeToCareers({ employerId: company.employerId, company: company.name, email, source: b.source === 'widget' ? 'WIDGET' : 'CAREERS_PAGE' });
  } catch (err) {
    console.error('[POST /api/jobs/notify]', err);
    return NextResponse.json({ error: 'We couldn’t sign you up. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

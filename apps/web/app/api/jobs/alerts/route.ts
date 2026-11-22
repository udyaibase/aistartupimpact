import { NextRequest, NextResponse } from 'next/server';
import { humanCheckFailed } from '@/lib/turnstile';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { careersSubscribeRateLimit } from '@/lib/event-rate-limit';
import { normalizeEmail } from '@/lib/jobs/careers-subscribers';
import { cleanFilters, subscribeToJobAlert, MAX_ALERTS_PER_EMAIL } from '@/lib/jobs/job-alerts';

export const dynamic = 'force-dynamic';

/** A site visitor asks for a weekly email of new jobs (role and/or city). Sends a confirmation email first. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(careersSubscribeRateLimit, `job-alert:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many sign-ups from this network. Please try again later.' }, { status: 429 });
  const b = await request.json().catch(() => ({}));
  const notHuman = await humanCheckFailed(b?.turnstileToken);
  if (notHuman) return notHuman;
  if (typeof b.website === 'string' && b.website) return NextResponse.json({ success: true }); // honeypot
  const email = normalizeEmail(b.email);
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.', field: 'email' }, { status: 400 });
  if (b.consent !== true) return NextResponse.json({ error: 'Tick the box to agree to these emails.', field: 'consent' }, { status: 400 });
  try {
    const r = await subscribeToJobAlert(email, cleanFilters(b));
    if (r === 'limit') return NextResponse.json({ error: `You already have ${MAX_ALERTS_PER_EMAIL} job alerts. Stop one from its email to add another.` }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/jobs/alerts]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'We couldn’t set up your alert. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

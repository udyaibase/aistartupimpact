import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { EVENT_REPORT_REASONS, eventReporterHash, reportEvent } from '@/lib/events/trust';

export const dynamic = 'force-dynamic';

/** Public "Report this event". Rate limited; one report per person per event counts; 3 hide it for review. */
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const ip = getClientIdentifier(request);
  const { success } = await checkRateLimit(strictRateLimit, `event-report:${ip}`);
  if (!success) return NextResponse.json({ error: 'Too many reports. Please try again later.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? '');
  if (!EVENT_REPORT_REASONS.some((r) => r.value === reason)) return NextResponse.json({ error: 'Choose a reason.', field: 'reason' }, { status: 400 });
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : '';
  if (reason === 'other' && details.length < 10) return NextResponse.json({ error: 'Tell us a little more.', field: 'details' }, { status: 400 });
  const email = typeof body.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ? body.email.trim().slice(0, 200) : null;

  const event = await prisma.event.findFirst({ where: { slug, deletedAt: null, status: 'PUBLISHED' }, select: { id: true, title: true, slug: true } });
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

  await reportEvent({ event, reason, details, email, hash: eventReporterHash(ip, event.id) });
  // Same answer either way, so reporters can't tell whether they tipped an event into review.
  return NextResponse.json({ success: true });
}

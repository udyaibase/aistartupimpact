import { NextRequest, NextResponse } from 'next/server';
import { internalAuthorized } from '@/lib/internal-auth';
import { finishPublishedEvent } from '@/lib/events/trust';

export const dynamic = 'force-dynamic';

/**
 * Admin app → web: an admin approved an event. Runs its go-live steps now (Pro featured placement, first-event
 * free Boost, page refresh). Safe to repeat; the daily cron does the same for anything missed.
 */
export async function POST(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { eventId } = await request.json().catch(() => ({}));
  if (typeof eventId !== 'string' || !eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  return NextResponse.json({ success: true, finished: await finishPublishedEvent(eventId) });
}

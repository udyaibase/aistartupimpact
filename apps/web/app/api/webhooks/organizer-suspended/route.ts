import { NextRequest, NextResponse } from 'next/server';
import { internalAuthorized } from '@/lib/internal-auth';
import { processSuspendedEvents } from '@/lib/events/trust';

export const dynamic = 'force-dynamic';

/** Admin app → web: an organizer was suspended. Emails attendees of the cancelled events and refunds tickets now. */
export async function POST(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { organizerId } = await request.json().catch(() => ({}));
  if (typeof organizerId !== 'string' || !organizerId) return NextResponse.json({ error: 'organizerId required' }, { status: 400 });
  return NextResponse.json({ success: true, events: await processSuspendedEvents({ organizerId }) });
}

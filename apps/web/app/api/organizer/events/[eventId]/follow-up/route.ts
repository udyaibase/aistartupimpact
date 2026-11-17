import { NextRequest, NextResponse } from 'next/server';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { sendFollowUp } from '@/lib/events/follow-ups';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Send the follow-up emails for this event now (thank-you to attendees, sorry-we-missed-you to the rest). */
export async function POST(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'promote');
  if (access instanceof NextResponse) return access;
  const { event, session } = access;
  const { success, reset } = await checkRateLimit(apiRateLimit, `follow-up:${event.id}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  const r = await sendFollowUp(event.id);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  await logOrganizerActivity(session.organizerId, 'event_updated', { actor: organizerActor(session), request, metadata: { title: event.title, what: `follow-up sent to ${r.sent}` } }).catch(() => {});
  return NextResponse.json({ success: true, ...r });
}

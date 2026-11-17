import { NextRequest, NextResponse } from 'next/server';
import { canAccessEvent, requirePermission } from '@/lib/organizer-auth/require-permission';
import { duplicateEvent } from '@/lib/events/duplicate';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

/** "Run it again": copy this event to a new date as a draft. Body: { date: "YYYY-MM-DD" }. */
export async function POST(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const result = await requirePermission('events.create');
  if (result instanceof NextResponse) return result;
  const session = result;
  if (!canAccessEvent(session, eventId)) return NextResponse.json({ success: false, error: 'Not authorized for this event' }, { status: 403 });
  const { success, reset } = await checkRateLimit(apiRateLimit, `event-duplicate:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  const body = await request.json().catch(() => ({}));
  const r = await duplicateEvent(eventId, session.organizerId, String(body?.date ?? ''));
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  await logOrganizerActivity(session.organizerId, 'event_created', { actor: organizerActor(session), request, metadata: { title: `${r.title} (copy)` } }).catch(() => {});
  return NextResponse.json({ success: true, id: r.id, slug: r.slug });
}

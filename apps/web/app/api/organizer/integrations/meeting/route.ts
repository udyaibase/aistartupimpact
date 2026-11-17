import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { canAccessEvent, requirePermission } from '@/lib/organizer-auth/require-permission';
import { isProvider, PROVIDER_LABEL, ReconnectNeeded, type Provider } from '@/lib/integrations/providers';
import { makeMeeting } from '@/lib/integrations/meetings';
import { cleanTimeZone } from '@/lib/events/zoned-time';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

import { meetingProof } from '@/lib/integrations/meeting-proof';

export const dynamic = 'force-dynamic';

/**
 * Create a Zoom meeting or Google Meet link for an event (new or existing). With eventId, the event keeps the
 * meeting's id so later time changes move the meeting too.
 */
export async function POST(request: NextRequest) {
  const session = await requirePermission('events.create');
  if (session instanceof NextResponse) return session;
  const { success, reset } = await checkRateLimit(apiRateLimit, `meeting-create:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  const body = await request.json().catch(() => ({}));
  if (!isProvider(body.provider)) return NextResponse.json({ success: false, error: 'Choose Zoom or Google Meet.' }, { status: 400 });
  const provider: Provider = body.provider;
  const title = String(body.title ?? '').trim().slice(0, 200);
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (!title) return NextResponse.json({ success: false, error: 'Add the event title first.' }, { status: 400 });
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ success: false, error: 'Set the date, start and end time first.' }, { status: 400 });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : null;
  if (eventId) {
    if (!canAccessEvent(session, eventId)) return NextResponse.json({ success: false, error: 'Not authorized for this event' }, { status: 403 });
    const own = await prisma.event.findFirst({ where: { id: eventId, organizerId: session.organizerId, deletedAt: null }, select: { id: true } });
    if (!own) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
  }

  try {
    const m = await makeMeeting(session.organizerId, provider, { title, startAt, endAt, timezone: cleanTimeZone(body.timezone) });
    if (eventId) {
      await prisma.event.update({ where: { id: eventId }, data: { meetingLink: m.joinUrl, meetingProvider: provider, meetingExternalId: m.externalId } });
    }
    return NextResponse.json({ success: true, provider, joinUrl: m.joinUrl, externalId: m.externalId, meetingProof: meetingProof(session.organizerId, provider, m.externalId) });
  } catch (e) {
    if (e instanceof ReconnectNeeded) {
      return NextResponse.json({ success: false, code: 'RECONNECT', error: `Connect ${PROVIDER_LABEL[provider]} again in Settings, then try once more.` }, { status: 409 });
    }
    console.warn('[integrations] meeting failed', provider, e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, error: `${PROVIDER_LABEL[provider]} didn’t create the meeting. Please try again.` }, { status: 502 });
  }
}

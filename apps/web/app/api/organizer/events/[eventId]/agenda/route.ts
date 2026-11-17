import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { cleanSessions, cleanTracks, eventDayCount } from '@/lib/events/agenda';
import { refreshPaths } from '@/lib/revalidate';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.view');
  if (access instanceof NextResponse) return access;
  const { event } = access;
  const full = await prisma.event.findUnique({
    where: { id: event.id },
    select: {
      agendaTracks: true,
      speakers: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, company: true } },
      agendaItems: { orderBy: [{ dayNumber: 'asc' }, { startTime: 'asc' }, { sortOrder: 'asc' }] },
    },
  });
  return NextResponse.json({
    success: true,
    event: { id: event.id, slug: event.slug, title: event.title, startAt: event.startAt, endAt: event.endAt, timezone: event.timezone },
    days: eventDayCount(event.startAt, event.endAt, event.timezone),
    tracks: full?.agendaTracks ?? [],
    speakers: full?.speakers ?? [],
    sessions: (full?.agendaItems ?? []).map((a) => ({
      id: a.id, dayNumber: a.dayNumber, startTime: a.startTime, endTime: a.endTime, title: a.title, description: a.description,
      speakerId: a.speakerId, track: a.track, recordingUrl: a.recordingUrl, slidesUrl: a.slidesUrl,
    })),
  });
}

/** Save tracks and sessions. Sessions are updated in place by id, so links (recordings, speakers) never get lost. */
export async function PUT(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.edit');
  if (access instanceof NextResponse) return access;
  const { event, session } = access;
  const body = await request.json().catch(() => ({}));
  const tracks = cleanTracks(body.tracks);
  const speakers = await prisma.eventSpeaker.findMany({ where: { eventId: event.id }, select: { id: true } });
  const cleaned = cleanSessions(body.sessions, { tracks, speakerIds: new Set(speakers.map((s) => s.id)) });
  if ('error' in cleaned) return NextResponse.json({ success: false, error: cleaned.error, row: cleaned.row }, { status: 400 });

  const ordered = [...cleaned.sessions].sort((a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime));
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: event.id }, data: { agendaTracks: tracks } });
    const existing = await tx.eventAgendaItem.findMany({ where: { eventId: event.id }, select: { id: true } });
    const ownIds = new Set(existing.map((e) => e.id));
    const kept = new Set<string>();
    for (const [i, s] of ordered.entries()) {
      const { id, ...fields } = s;
      const data = { ...fields, sortOrder: i };
      if (id && ownIds.has(id) && !kept.has(id)) {
        kept.add(id);
        await tx.eventAgendaItem.update({ where: { id }, data });
      } else {
        await tx.eventAgendaItem.create({ data: { eventId: event.id, ...data } });
      }
    }
    const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
    if (gone.length) await tx.eventAgendaItem.deleteMany({ where: { id: { in: gone }, eventId: event.id } });
  }, { timeout: 20_000 });

  refreshPaths([`/events/${event.slug}`]);
  await logOrganizerActivity(session.organizerId, 'event_updated', { actor: organizerActor(session), request, metadata: { title: event.title, what: 'agenda' } }).catch(() => {});
  return NextResponse.json({ success: true });
}

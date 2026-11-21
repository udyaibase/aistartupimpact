import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requirePermission, isEventLimited } from '@/lib/organizer-auth/require-permission';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { MAX_SERIES_PER_ORGANIZER, uniqueSeriesSlug } from '@/lib/events/series';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requirePermission('events.view');
  if (session instanceof NextResponse) return session;
  // Teammates limited to some events see only the series their events belong to.
  const series = await prisma.eventSeries.findMany({
    where: { organizerId: session.organizerId, ...(isEventLimited(session) ? { events: { some: { id: { in: session.assignedEventIds } } } } : {}) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, slug: true, name: true, recurrence: true, createdAt: true,
      _count: { select: { events: { where: { deletedAt: null } }, followers: { where: { confirmedAt: { not: null }, unsubscribedAt: null } } } },
    },
  });
  return NextResponse.json({ success: true, series });
}

export async function POST(request: NextRequest) {
  const session = await requirePermission('events.edit');
  if (session instanceof NextResponse) return session;
  const limited = await hostWriteLimit(session.id);
  if (limited) return limited;
  if (isEventLimited(session)) return NextResponse.json({ success: false, error: 'Your role in this workspace doesn’t allow this.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (name.length < 3) return NextResponse.json({ success: false, error: 'Give the series a name (at least 3 characters).' }, { status: 400 });
  const count = await prisma.eventSeries.count({ where: { organizerId: session.organizerId } });
  if (count >= MAX_SERIES_PER_ORGANIZER) return NextResponse.json({ success: false, error: `You can have up to ${MAX_SERIES_PER_ORGANIZER} series.` }, { status: 400 });
  const description = String(body.description ?? '').trim().slice(0, 1000) || null;
  const created = await prisma.eventSeries.create({
    data: { organizerId: session.organizerId, name, description, slug: await uniqueSeriesSlug(name) },
    select: { id: true },
  });
  await logOrganizerActivity(session.organizerId, 'event_content_changed', { actor: organizerActor(session), request, metadata: { what: `Created the series “${name}”` } });
  return NextResponse.json({ success: true, id: created.id });
}

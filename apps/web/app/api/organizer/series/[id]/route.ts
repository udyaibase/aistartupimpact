import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';
import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@udyaibase/database';
import { canAccessEvent, requirePermission, isEventLimited } from '@/lib/organizer-auth/require-permission';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { cleanRecurrence, uniqueSeriesSlug } from '@/lib/events/series';
import { isOwnMediaUrl } from '@/lib/events/certificate-pdf';
import { refreshPaths } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

const MAX_EVENTS_IN_SERIES = 200;

async function own(id: string, organizerId: string) {
  return prisma.eventSeries.findFirst({ where: { id, organizerId } });
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await requirePermission('events.view');
  if (session instanceof NextResponse) return session;
  const series = await own(id, session.organizerId);
  if (!series) return NextResponse.json({ success: false, error: 'Series not found' }, { status: 404 });
  const [events, followers] = await Promise.all([
    prisma.event.findMany({
      where: { organizerId: session.organizerId, deletedAt: null, sourceUrl: null },
      orderBy: { startAt: 'desc' },
      take: 300,
      select: { id: true, title: true, startAt: true, timezone: true, status: true, seriesId: true },
    }),
    prisma.eventSeriesFollower.count({ where: { seriesId: id, confirmedAt: { not: null }, unsubscribedAt: null } }),
  ]);
  return NextResponse.json({
    success: true,
    series: { id: series.id, slug: series.slug, name: series.name, description: series.description, coverImageUrl: series.coverImageUrl, recurrence: cleanRecurrence(series.recurrence), lastGeneratedFor: series.lastGeneratedFor },
    followers,
    events: events.filter((e) => canAccessEvent(session, e.id)).map((e) => ({ ...e, inSeries: e.seriesId === id, inOtherSeries: !!e.seriesId && e.seriesId !== id })),
  });
}

/** Update details, which events belong to the series, and the repeat rule. */
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await requirePermission('events.edit');
  if (session instanceof NextResponse) return session;
  const limited = await hostWriteLimit(session.id);
  if (limited) return limited;
  if (isEventLimited(session)) return NextResponse.json({ success: false, error: 'Your role in this workspace doesn’t allow this.' }, { status: 403 });
  const series = await own(id, session.organizerId);
  if (!series) return NextResponse.json({ success: false, error: 'Series not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));

  const name = String(body.name ?? series.name).trim().replace(/\s+/g, ' ').slice(0, 100);
  if (name.length < 3) return NextResponse.json({ success: false, error: 'Give the series a name (at least 3 characters).' }, { status: 400 });
  const description = body.description === undefined ? series.description : String(body.description ?? '').trim().slice(0, 1000) || null;
  const coverImageUrl = body.coverImageUrl === undefined ? series.coverImageUrl : isOwnMediaUrl(body.coverImageUrl) ? body.coverImageUrl : null;

  // Events: only this host's own events that this person can access.
  let eventIds: string[] | null = null;
  if (Array.isArray(body.eventIds)) {
    const wanted = body.eventIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_EVENTS_IN_SERIES);
    const ok = await prisma.event.findMany({ where: { id: { in: wanted }, organizerId: session.organizerId, deletedAt: null, sourceUrl: null }, select: { id: true } });
    eventIds = ok.map((e) => e.id).filter((eid) => canAccessEvent(session, eid));
  }

  let recurrence: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
  if (body.recurrence === null) recurrence = Prisma.DbNull;
  else if (body.recurrence !== undefined) {
    const rule = cleanRecurrence(body.recurrence);
    if (!rule) return NextResponse.json({ success: false, error: 'Choose how often it repeats and which event to copy.' }, { status: 400 });
    const template = await prisma.event.findFirst({ where: { id: rule.templateEventId, organizerId: session.organizerId, deletedAt: null, sourceUrl: null }, select: { id: true } });
    if (!template || !canAccessEvent(session, template.id)) return NextResponse.json({ success: false, error: 'The event to copy wasn’t found.' }, { status: 400 });
    recurrence = rule;
    // The template is always part of the series.
    if (eventIds && !eventIds.includes(template.id)) eventIds.push(template.id);
  }

  const slug = name !== series.name ? await uniqueSeriesSlug(name, series.id) : series.slug;
  await prisma.$transaction(async (tx) => {
    await tx.eventSeries.update({
      where: { id },
      data: {
        name, description, coverImageUrl, slug,
        ...(recurrence !== undefined && { recurrence }),
        // A changed rule starts from today, never back-filling past dates.
        ...(recurrence !== undefined && JSON.stringify(recurrence) !== JSON.stringify(series.recurrence) && { lastGeneratedFor: new Date() }),
      },
    });
    if (eventIds) {
      await tx.event.updateMany({ where: { seriesId: id, organizerId: session.organizerId, id: { notIn: eventIds } }, data: { seriesId: null } });
      const joining = { id: { in: eventIds }, organizerId: session.organizerId, OR: [{ seriesId: null }, { seriesId: { not: id } }] };
      // Already published events aren't news to followers; drafts are announced when they're published.
      await tx.event.updateMany({ where: { ...joining, status: 'PUBLISHED' }, data: { seriesId: id, seriesAnnouncedAt: new Date() } });
      await tx.event.updateMany({ where: joining, data: { seriesId: id } });
    }
  });
  refreshPaths([`/series/${series.slug}`, ...(slug !== series.slug ? [`/series/${slug}`] : [])]);
  await logOrganizerActivity(session.organizerId, 'event_content_changed', { actor: organizerActor(session), request, metadata: { what: `Edited the series “${name}”` } });
  return NextResponse.json({ success: true, slug });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await requirePermission('events.edit');
  if (session instanceof NextResponse) return session;
  const limited = await hostWriteLimit(session.id);
  if (limited) return limited;
  if (isEventLimited(session)) return NextResponse.json({ success: false, error: 'Your role in this workspace doesn’t allow this.' }, { status: 403 });
  const series = await own(id, session.organizerId);
  if (!series) return NextResponse.json({ success: false, error: 'Series not found' }, { status: 404 });
  // Events stay; they just leave the series. Followers are removed with it.
  await prisma.eventSeries.delete({ where: { id } });
  refreshPaths([`/series/${series.slug}`]);
  await logOrganizerActivity(session.organizerId, 'event_content_changed', { actor: organizerActor(session), request, metadata: { what: `Deleted the series “${series.name}”` } });
  return NextResponse.json({ success: true });
}

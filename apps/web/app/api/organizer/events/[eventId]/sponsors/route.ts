import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { cleanSponsors, sponsorsAllowed, tierRank } from '@/lib/events/sponsors';
import { refreshPaths } from '@/lib/revalidate';

import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.view');
  if (access instanceof NextResponse) return access;
  const { event } = access;
  const sponsors = await prisma.eventSponsor.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  const startupIds = sponsors.map((s) => s.startupId).filter((x): x is string => !!x);
  const startups = startupIds.length ? await prisma.startup.findMany({ where: { id: { in: startupIds } }, select: { id: true, name: true, slug: true } }) : [];
  return NextResponse.json({
    success: true, allowed: await sponsorsAllowed(event.organizerId),
    event: { id: event.id, slug: event.slug, title: event.title },
    sponsors: sponsors.map((s) => ({ ...s, startup: startups.find((x) => x.id === s.startupId) ?? null })),
  });
}

/** Save the sponsor list (updated in place by id, so their counts carry on). Pro only. */
export async function PUT(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.edit');
  if (access instanceof NextResponse) return access;
  const { event } = access;
  if (!(await sponsorsAllowed(event.organizerId))) return NextResponse.json({ success: false, error: 'Sponsors are part of Pro.', code: 'PRO_REQUIRED' }, { status: 402 });
  const body = await request.json().catch(() => ({}));
  const cleaned = cleanSponsors(body.sponsors);
  if ('error' in cleaned) return NextResponse.json({ success: false, error: cleaned.error }, { status: 400 });
  // Only real, live startups can be linked.
  const ids = cleaned.map((s) => s.startupId).filter((x): x is string => !!x);
  const live = ids.length ? new Set((await prisma.startup.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } })).map((s) => s.id)) : new Set<string>();
  const ordered = [...cleaned].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  await prisma.$transaction(async (tx) => {
    const existing = await tx.eventSponsor.findMany({ where: { eventId: event.id }, select: { id: true } });
    const own = new Set(existing.map((e) => e.id));
    const kept = new Set<string>();
    for (const [i, s] of ordered.entries()) {
      const { id, ...f } = s;
      const data = { ...f, startupId: f.startupId && live.has(f.startupId) ? f.startupId : null, sortOrder: i };
      if (id && own.has(id) && !kept.has(id)) { kept.add(id); await tx.eventSponsor.update({ where: { id }, data }); }
      else await tx.eventSponsor.create({ data: { eventId: event.id, ...data } });
    }
    const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
    if (gone.length) await tx.eventSponsor.deleteMany({ where: { id: { in: gone }, eventId: event.id } });
  });
  refreshPaths([`/events/${event.slug}`]);
  await logOrganizerActivity(event.organizerId, 'event_content_changed', { actor: organizerActor(access.session), request, metadata: { what: `Updated the sponsors (${ordered.length})`, event: event.title } });
  return NextResponse.json({ success: true });
}

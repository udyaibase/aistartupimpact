import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { canAccessEvent, requirePermission } from '@/lib/organizer-auth/require-permission';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

/**
 * Series stats for the host, counts only: page views, followers (never their addresses), and per event registrations,
 * check-ins and how many people came to more than one event.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await requirePermission('events.view');
  if (session instanceof NextResponse) return session;
  const series = await prisma.eventSeries.findFirst({ where: { id, organizerId: session.organizerId }, select: { id: true, slug: true } });
  if (!series) return NextResponse.json({ success: false, error: 'Series not found' }, { status: 404 });

  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since60 = new Date(now - 60 * DAY);
  const path = `/series/${series.slug}`;
  const active = { seriesId: id, confirmedAt: { not: null }, unsubscribedAt: null };

  const events = (await prisma.event.findMany({
    where: { seriesId: id, organizerId: session.organizerId, deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] } },
    orderBy: { startAt: 'desc' },
    take: 100,
    select: { id: true, title: true, startAt: true, endAt: true, timezone: true },
  })).filter((e) => canAccessEvent(session, e.id));
  const ids = events.map((e) => e.id);
  const countable = { eventId: { in: ids }, deletedAt: null, cancelledAt: null, status: { in: ['CONFIRMED', 'CHECKED_IN'] as ('CONFIRMED' | 'CHECKED_IN')[] } };

  const [views30, viewsPrev, visitorRows, followers, newFollowers30, stopped30, regs, checkins, repeatRows] = await Promise.all([
    prisma.pageView.count({ where: { pathname: path, createdAt: { gte: since30 } } }),
    prisma.pageView.count({ where: { pathname: path, createdAt: { gte: since60, lt: since30 } } }),
    prisma.pageView.groupBy({ by: ['sessionHash'], where: { pathname: path, createdAt: { gte: since30 } } }),
    prisma.eventSeriesFollower.count({ where: active }),
    prisma.eventSeriesFollower.count({ where: { ...active, confirmedAt: { gte: since30 } } }),
    prisma.eventSeriesFollower.count({ where: { seriesId: id, unsubscribedAt: { gte: since30 } } }),
    ids.length ? prisma.eventRegistration.groupBy({ by: ['eventId'], where: countable, _count: { _all: true } }) : [],
    ids.length ? prisma.eventRegistration.groupBy({ by: ['eventId'], where: { ...countable, checkedInAt: { not: null } }, _count: { _all: true } }) : [],
    // People (by email) who checked in to two or more events in the series. Only the number leaves the database.
    ids.length
      ? prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n FROM (
            SELECT LOWER(COALESCE(r."guestEmail", u."email")) AS email
            FROM "EventRegistration" r LEFT JOIN "WebUser" u ON u."id" = r."userId"
            WHERE r."eventId" = ANY(${ids}) AND r."deletedAt" IS NULL AND r."cancelledAt" IS NULL AND r."checkedInAt" IS NOT NULL
            GROUP BY 1 HAVING COUNT(DISTINCT r."eventId") > 1 AND LOWER(COALESCE(r."guestEmail", u."email")) IS NOT NULL
          ) t`
      : [{ n: BigInt(0) }],
  ]);

  const regBy = new Map(regs.map((r) => [r.eventId, r._count._all]));
  const inBy = new Map(checkins.map((r) => [r.eventId, r._count._all]));
  const rows = events.map((e) => {
    const past = (e.endAt ?? e.startAt).getTime() < now;
    return { id: e.id, title: e.title, startAt: e.startAt, timezone: e.timezone, past, registrations: regBy.get(e.id) ?? 0, attended: past ? inBy.get(e.id) ?? 0 : null };
  });
  const pastRows = rows.filter((r) => r.past);
  const pastRegs = pastRows.reduce((a, r) => a + r.registrations, 0);
  const attended = pastRows.reduce((a, r) => a + (r.attended ?? 0), 0);

  return NextResponse.json({
    success: true,
    views: { last30: views30, previous30: viewsPrev, visitors30: visitorRows.length },
    followers: { total: followers, new30: newFollowers30, stopped30 },
    totals: {
      events: rows.length,
      registrations: rows.reduce((a, r) => a + r.registrations, 0),
      attended,
      attendanceRate: pastRegs ? Math.round((attended / pastRegs) * 100) : null,
      cameBack: Number(repeatRows[0]?.n ?? 0),
    },
    events: rows,
  });
}

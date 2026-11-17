import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { sponsorReportCsv } from '@/lib/events/sponsors';

export const dynamic = 'force-dynamic';

/** Sponsor report (CSV): page views with each logo, clicks and click rate. */
export async function GET(_request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'analytics.view');
  if (access instanceof NextResponse) return access;
  const { event } = access;
  const rows = await prisma.eventSponsor.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, select: { name: true, tier: true, impressions: true, clicks: true } });
  const csv = sponsorReportCsv(event.title, rows);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sponsor-report-${event.slug.slice(0, 60)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

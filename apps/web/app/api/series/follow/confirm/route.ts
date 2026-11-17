import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { verifySeriesFollowToken } from '@/lib/events/after-event';

export const dynamic = 'force-dynamic';

/** The link in the confirmation email. */
export async function GET(request: NextRequest) {
  const id = verifySeriesFollowToken(request.nextUrl.searchParams.get('t'), 'confirm');
  const f = id ? await prisma.eventSeriesFollower.findUnique({ where: { id }, select: { id: true, confirmedAt: true, series: { select: { slug: true } } } }) : null;
  if (!f) return NextResponse.redirect(new URL('/events', request.url));
  if (!f.confirmedAt) await prisma.eventSeriesFollower.update({ where: { id: f.id }, data: { confirmedAt: new Date(), unsubscribedAt: null } });
  return NextResponse.redirect(new URL(`/series/${f.series.slug}?following=1`, request.url));
}

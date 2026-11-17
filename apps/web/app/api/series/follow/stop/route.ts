import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { verifySeriesFollowToken } from '@/lib/events/after-event';

export const dynamic = 'force-dynamic';

/** Stop series emails. Works from the page button (JSON body) and from mail apps' one-click unsubscribe (?t=). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = verifySeriesFollowToken(request.nextUrl.searchParams.get('t') ?? body?.t, 'stop');
  if (!id) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  await prisma.eventSeriesFollower.updateMany({ where: { id, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
  return NextResponse.json({ success: true });
}

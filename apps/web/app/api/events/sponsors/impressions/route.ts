import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Sponsor logos were seen on an event page. Counted a few times per visitor per hour at most. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const eventId = typeof body?.eventId === 'string' && body.eventId.length < 60 ? body.eventId : null;
  if (!eventId) return NextResponse.json({ ok: false }, { status: 400 });
  const { success } = await checkRateLimit(strictRateLimit, `sponsor-view:${eventId}:${getClientIdentifier(request)}`);
  if (success) await prisma.eventSponsor.updateMany({ where: { eventId }, data: { impressions: { increment: 1 } } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

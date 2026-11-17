import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { isBadgeLayout, MAX_BADGES, renderBadgesPdf } from '@/lib/events/badges';
import { eventDateText } from '@/lib/events/certificates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Badges PDF. ?layout=a4|label|a6, ?who=confirmed (default: everyone coming) | checked_in,
 * or ?registrationId= for one badge printed at the door.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'checkin');
  if (access instanceof NextResponse) return access;
  const { event } = access;
  const q = request.nextUrl.searchParams;
  const layout = isBadgeLayout(q.get('layout')) ? (q.get('layout') as 'a4' | 'label' | 'a6') : 'a4';
  const one = q.get('registrationId');
  const who = q.get('who') === 'checked_in' ? ['CHECKED_IN'] : ['CONFIRMED', 'CHECKED_IN'];

  const regs = await prisma.eventRegistration.findMany({
    where: { eventId: event.id, deletedAt: null, ...(one ? { id: one } : { status: { in: who as ('CONFIRMED' | 'CHECKED_IN')[] } }) },
    orderBy: { guestName: 'asc' },
    take: MAX_BADGES,
    select: { guestName: true, guestCompany: true, guestOccupation: true, qrToken: true, ticketTier: { select: { name: true } } },
  });
  if (one && !regs.length) return NextResponse.json({ success: false, error: 'Registration not found' }, { status: 404 });

  const pdf = await renderBadgesPdf({
    eventTitle: event.title,
    eventDate: eventDateText(event.startAt, event.endAt, event.timezone),
    layout: one && layout === 'a4' ? 'label' : layout,
    people: regs.map((r) => ({ name: r.guestName ?? '', company: r.guestCompany, occupation: r.guestOccupation, tier: r.ticketTier?.name ?? null, qrToken: r.qrToken })),
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${one ? 'inline' : 'attachment'}; filename="badges-${event.slug.slice(0, 60)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

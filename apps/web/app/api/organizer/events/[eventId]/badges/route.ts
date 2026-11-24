import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { isBadgeLayout, MAX_BADGES, renderBadgesPdf, type BadgeLayout } from '@/lib/events/badges';
import { eventDateText } from '@/lib/events/certificates';
import { badgeContext } from '@/lib/events/badge-design';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Badges PDF. ?layout=a4|label|a6|card, ?who=confirmed (default: everyone coming) | checked_in,
 * or ?registrationId= for one badge printed at the door.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'checkin');
  if (access instanceof NextResponse) return access;
  const { event } = access;
  const q = request.nextUrl.searchParams;
  const layout = isBadgeLayout(q.get('layout')) ? q.get('layout') as BadgeLayout : 'a4';
  const one = q.get('registrationId');
  const who = q.get('who') === 'checked_in' ? ['CHECKED_IN'] : ['CONFIRMED', 'CHECKED_IN'];

  const regs = await prisma.eventRegistration.findMany({
    where: { eventId: event.id, deletedAt: null, ...(one ? { id: one } : { status: { in: who as ('CONFIRMED' | 'CHECKED_IN')[] } }) },
    orderBy: { guestName: 'asc' },
    take: MAX_BADGES,
    select: { id: true, guestName: true, guestCompany: true, guestOccupation: true, qrToken: true, ticketTierId: true, ticketTier: { select: { name: true } } },
  });
  // The event's badge design (templates for every host; Pro options only while on Pro).
  const ctx = await badgeContext(event.id);
  const questionIds = ctx?.settings.questionIds ?? [];
  const answerRows = questionIds.length && regs.length
    ? await prisma.eventRegistrationAnswer.findMany({
        where: { questionId: { in: questionIds }, registration: { eventId: event.id, deletedAt: null } },
        select: { registrationId: true, questionId: true, answerText: true },
      })
    : [];
  const answersFor = new Map<string, Record<string, string>>();
  for (const a of answerRows) answersFor.set(a.registrationId, { ...(answersFor.get(a.registrationId) ?? {}), [a.questionId]: a.answerText.slice(0, 60) });
  if (one && !regs.length) return NextResponse.json({ success: false, error: 'Registration not found' }, { status: 404 });

  const pdf = await renderBadgesPdf({
    eventTitle: event.title,
    eventDate: eventDateText(event.startAt, event.endAt, event.timezone),
    layout: one && layout === 'a4' ? 'label' : layout,
    people: regs.map((r) => ({ name: r.guestName ?? '', company: r.guestCompany, occupation: r.guestOccupation, tier: r.ticketTier?.name ?? null, qrToken: r.qrToken, tierId: r.ticketTierId, answers: answersFor.get(r.id) })),
    design: ctx?.design,
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${one ? 'inline' : 'attachment'}; filename="badges-${event.slug.slice(0, 60)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

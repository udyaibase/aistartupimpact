import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rosterHashInput, type RosterRow } from '@/lib/events/checkin-rules';
import { maskEmail } from '@/lib/mask';

const hash = (eventId: string, kind: 'ticket' | 'email', value: string) => createHash('sha256').update(rosterHashInput(eventId, kind, value)).digest('hex');
import { prisma } from '@udyaibase/database';
import { requirePermission, canAccessEvent } from '@/lib/organizer-auth/require-permission';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 20_000;

/** The attendee list for offline check-in at the door. Only what's needed to find and admit someone. */
export async function GET(request: NextRequest) {
  const result = await requirePermission('checkin');
  if (result instanceof NextResponse) return result;
  const session = result;
  const eventId = request.nextUrl.searchParams.get('eventId') ?? '';
  if (!eventId || !canAccessEvent(session, eventId)) return NextResponse.json({ success: false, error: 'Not authorized for this event' }, { status: 403 });
  const event = await prisma.event.findFirst({ where: { id: eventId, organizerId: session.organizerId, deletedAt: null }, select: { id: true, title: true, endAt: true } });
  if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });

  const regs = await prisma.eventRegistration.findMany({
    where: { eventId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: MAX_ROWS,
    select: { id: true, qrToken: true, guestName: true, guestEmail: true, guestCompany: true, guestOccupation: true, status: true, checkedInAt: true, ticketTier: { select: { name: true } } },
  });
  return NextResponse.json({
    success: true,
    event,
    downloadedAt: new Date().toISOString(),
    // Kept until the event ends, then deleted from the device; signing out deletes it too.
    keepUntil: new Date(event.endAt.getTime() + 864e5).toISOString(),
    downloadedBy: session.id,
    // Hashes only: the device can match a scan or a typed email, but holds no working ticket or address list.
    rows: regs.map((r): RosterRow => ({
      id: r.id,
      tokenHash: r.qrToken ? hash(event.id, 'ticket', r.qrToken) : null,
      emailHash: r.guestEmail ? hash(event.id, 'email', r.guestEmail) : null,
      emailHint: r.guestEmail ? maskEmail(r.guestEmail) : '',
      name: r.guestName ?? '', company: r.guestCompany, occupation: r.guestOccupation,
      tier: r.ticketTier?.name ?? null, status: r.status, checkedInAt: r.checkedInAt?.toISOString() ?? null,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

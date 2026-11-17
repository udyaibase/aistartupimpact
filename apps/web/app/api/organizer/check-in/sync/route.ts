import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requirePermission, canAccessEvent } from '@/lib/organizer-auth/require-permission';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { BLOCKED_STATUSES, clampScanTime } from '@/lib/events/checkin-rules';
import { issueCertificateOnCheckIn } from '@/lib/events/certificates';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 500;

/**
 * Upload scans made offline. Safe to send twice: a registration is checked in once, and the first scan wins
 * (a later scan from another device never moves the time).
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission('checkin');
  if (result instanceof NextResponse) return result;
  const session = result;
  const body = await request.json().catch(() => ({}));
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  if (!eventId || !canAccessEvent(session, eventId)) return NextResponse.json({ success: false, error: 'Not authorized for this event' }, { status: 403 });
  const event = await prisma.event.findFirst({ where: { id: eventId, organizerId: session.organizerId, deletedAt: null }, select: { id: true, title: true } });
  if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });

  const raw: unknown[] = Array.isArray(body.scans) ? body.scans.slice(0, MAX_BATCH) : [];
  // Earliest scan per registration.
  const earliest = new Map<string, Date>();
  for (const s of raw) {
    const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    if (typeof r.registrationId !== 'string' || r.registrationId.length > 60) continue;
    const at = clampScanTime(r.scannedAt);
    const prev = earliest.get(r.registrationId);
    if (!prev || at < prev) earliest.set(r.registrationId, at);
  }

  const results: { registrationId: string; status: 'CHECKED_IN' | 'ALREADY_CHECKED_IN' | 'BLOCKED' | 'NOT_FOUND'; message?: string; checkedInAt?: string }[] = [];
  const newlyIn: string[] = [];
  for (const [registrationId, at] of earliest) {
    const done = await prisma.eventRegistration.updateMany({
      where: { id: registrationId, eventId, deletedAt: null, status: 'CONFIRMED' },
      data: { status: 'CHECKED_IN', checkedInAt: at },
    });
    if (done.count) { newlyIn.push(registrationId); results.push({ registrationId, status: 'CHECKED_IN', checkedInAt: at.toISOString() }); continue; }
    const reg = await prisma.eventRegistration.findFirst({ where: { id: registrationId, eventId, deletedAt: null }, select: { status: true, checkedInAt: true } });
    if (!reg) results.push({ registrationId, status: 'NOT_FOUND' });
    else if (reg.status === 'CHECKED_IN') {
      // Another device got there first; keep the earlier time.
      if (reg.checkedInAt && at < reg.checkedInAt) await prisma.eventRegistration.update({ where: { id: registrationId }, data: { checkedInAt: at } });
      results.push({ registrationId, status: 'ALREADY_CHECKED_IN', checkedInAt: (reg.checkedInAt && reg.checkedInAt < at ? reg.checkedInAt : at).toISOString() });
    } else results.push({ registrationId, status: 'BLOCKED', message: BLOCKED_STATUSES[reg.status] ?? 'Can’t be checked in' });
  }
  if (newlyIn.length) after(async () => { for (const id of newlyIn) await issueCertificateOnCheckIn(id); });
  // One log entry per synced batch, with the attendee ids for the record.
  if (newlyIn.length) after(() => logOrganizerActivity(session.organizerId, 'attendee_checked_in', {
    actor: organizerActor(session), request,
    metadata: { what: 'Checked in (offline, synced)', attendee: `${newlyIn.length} attendee${newlyIn.length === 1 ? '' : 's'}`, event: event.title, registrationIds: newlyIn.slice(0, 200).join(',') },
  }));
  return NextResponse.json({ success: true, results });
}

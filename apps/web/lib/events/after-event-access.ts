import { NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { canAccessEvent, requirePermission, type AuthorizedSession } from '@/lib/organizer-auth/require-permission';
import type { Permission } from '@/lib/organizer-auth/permissions';

/** The signed-in host's own event, if their role allows `permission` and covers this event; else the error response. */
export async function afterEventAccess(eventId: string, permission: Permission) {
  const result = await requirePermission(permission);
  if (result instanceof NextResponse) return result;
  const session = result as AuthorizedSession;
  if (!canAccessEvent(session, eventId)) return NextResponse.json({ success: false, error: 'Not authorized for this event' }, { status: 403 });
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId: session.organizerId, deletedAt: null },
    select: {
      id: true, slug: true, title: true, organizerId: true, startAt: true, endAt: true, status: true, timezone: true,
      certificateSettings: true, certificatesPaidAt: true, followUpSettings: true, followUpAutoSentAt: true,
    },
  });
  if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
  return { session, event };
}

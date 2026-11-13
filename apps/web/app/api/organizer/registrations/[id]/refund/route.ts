import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { refundTicket } from "@/lib/events/tickets";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { maskEmail } from '@/lib/mask';

export const dynamic = "force-dynamic";

/** Host refunds one paid ticket in full (their share is reversed). */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const result = await requirePermission("registrations.manage");
  if (result instanceof NextResponse) return result;
  const reg = await prisma.eventRegistration.findUnique({ where: { id }, select: { eventId: true, guestEmail: true, event: { select: { organizerId: true, title: true } } } });
  if (!reg || reg.event.organizerId !== result.organizerId || !canAccessEvent(result, reg.eventId)) {
    return NextResponse.json({ success: false, error: "Registration not found." }, { status: 404 });
  }
  const r = await refundTicket(id, "host");
  if (r.ok) {
    // Money went back to an attendee: always on record, with who did it.
    await logOrganizerActivity(result.organizerId, "ticket_refunded", { actor: organizerActor(result), request: _request, metadata: { attendee: reg.guestEmail ? maskEmail(reg.guestEmail) : "", event: reg.event.title ?? "" } });
  }
  return r.ok ? NextResponse.json({ success: true }) : NextResponse.json({ success: false, error: r.error }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { refundTicket } from "@/lib/events/tickets";

export const dynamic = "force-dynamic";

/** Host refunds one paid ticket in full (their share is reversed). */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const result = await requirePermission("registrations.manage");
  if (result instanceof NextResponse) return result;
  const reg = await prisma.eventRegistration.findUnique({ where: { id }, select: { eventId: true, event: { select: { organizerId: true } } } });
  if (!reg || reg.event.organizerId !== result.organizerId || !canAccessEvent(result, reg.eventId)) {
    return NextResponse.json({ success: false, error: "Registration not found." }, { status: 404 });
  }
  const r = await refundTicket(id, "host");
  return r.ok ? NextResponse.json({ success: true }) : NextResponse.json({ success: false, error: r.error }, { status: 400 });
}

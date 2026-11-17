import { NextRequest, NextResponse, after } from "next/server";
import { issueCertificateOnCheckIn } from "@/lib/events/certificates";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { logOrganizerActivity, organizerActor } from "@/lib/workspace-activity";
import { maskEmail } from "@/lib/mask";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/check-in
 * Check in an attendee by QR token, email, or name.
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("checkin");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { eventId, input, action, registrationId } = await request.json().catch(() => ({}));

  if (typeof eventId !== "string" || !eventId || (!input && !registrationId)) {
    return NextResponse.json({ success: false, error: "Event and search input required" }, { status: 400 });
  }

  if (!canAccessEvent(session, eventId)) {
    return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId: session.organizerId, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!event) return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });

  const text = String(input).trim().slice(0, 200);
  const select = { id: true, guestName: true, guestEmail: true, guestCompany: true, guestOccupation: true, status: true, checkedInAt: true, ticketTier: { select: { name: true } } } as const;

  // An exact match admits at once: the person picked from a name search, the ticket's QR code, or the full email.
  let registration = typeof registrationId === "string" && registrationId
    ? await prisma.eventRegistration.findFirst({ where: { id: registrationId, eventId, deletedAt: null }, select })
    : null;
  if (!registration) {
    registration = await prisma.eventRegistration.findFirst({ where: { eventId, qrToken: text, deletedAt: null }, select });
  }
  if (!registration && text.includes("@")) {
    registration = await prisma.eventRegistration.findFirst({ where: { eventId, guestEmail: { equals: text, mode: "insensitive" }, deletedAt: null }, select });
  }

  // A name is only a search: it never admits anyone by itself. The door staff pick the right person from the list.
  if (!registration && action !== "undo" && text.length >= 2) {
    const matches = await prisma.eventRegistration.findMany({
      where: { eventId, deletedAt: null, guestName: { contains: text, mode: "insensitive" } },
      orderBy: { guestName: "asc" },
      take: 8,
      select,
    });
    if (matches.length) {
      return NextResponse.json({ success: false, status: "CHOOSE", message: matches.length === 1 ? "Is this the person? Tap to check in." : "More than one match. Tap the right person.", matches });
    }
  }

  if (!registration) {
    return NextResponse.json({ success: false, status: "NOT_FOUND", message: "No registration found" });
  }

  // Undo check-in
  if (action === "undo") {
    if (registration.status !== "CHECKED_IN") {
      return NextResponse.json({ success: false, status: "ERROR", message: "Not checked in" });
    }
    await prisma.eventRegistration.update({ where: { id: registration.id }, data: { status: "CONFIRMED", checkedInAt: null } });
    const undone = registration;
    after(() => logOrganizerActivity(session.organizerId, "attendee_checked_in", { actor: organizerActor(session), request, metadata: { what: "Undid the check-in of", attendee: undone.guestName || maskEmail(undone.guestEmail || ""), event: event.title, registrationId: undone.id } }));
    return NextResponse.json({ success: true, status: "UNDONE", attendee: { ...registration, status: "CONFIRMED" } });
  }

  // Already checked in — duplicate scan
  if (registration.status === "CHECKED_IN") {
    return NextResponse.json({
      success: false, status: "ALREADY_CHECKED_IN",
      message: `Already checked in at ${registration.checkedInAt ? new Date(registration.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "earlier"}`,
      attendee: registration,
    });
  }

  // Cancelled
  if (registration.status === "CANCELLED") {
    return NextResponse.json({ success: false, status: "CANCELLED", message: "Registration was cancelled", attendee: registration });
  }

  // Pending approval
  // Unpaid ticket holds can't be checked in.
  if (registration.status === "PENDING_PAYMENT") {
    return NextResponse.json({ success: false, status: "UNPAID", message: "Ticket not paid yet", attendee: registration });
  }

  if (registration.status === "PENDING_APPROVAL") {
    return NextResponse.json({ success: false, status: "PENDING_APPROVAL", message: "Registration pending approval", attendee: registration });
  }

  // Waitlisted
  if (registration.status === "WAITLISTED") {
    return NextResponse.json({ success: false, status: "WAITLISTED", message: "On waitlist (not confirmed)", attendee: registration });
  }

  // Check in!
  const now = new Date();
  // Two doors can scan the same ticket at once: only the first update wins.
  const done = await prisma.eventRegistration.updateMany({ where: { id: registration.id, status: { not: "CHECKED_IN" } }, data: { status: "CHECKED_IN", checkedInAt: now } });
  if (!done.count) {
    return NextResponse.json({ success: false, status: "ALREADY_CHECKED_IN", message: "Already checked in", attendee: { ...registration, status: "CHECKED_IN" } });
  }
  // Certificates on check-in (when the host turned that on): after the response, so scanning stays instant.
  const checkedInId = registration.id;
  after(() => issueCertificateOnCheckIn(checkedInId));
  // Who admitted whom, for the activity log (after the response, like the certificate).
  const admitted = registration;
  after(() => logOrganizerActivity(session.organizerId, "attendee_checked_in", { actor: organizerActor(session), request, metadata: { what: "Checked in", attendee: admitted.guestName || maskEmail(admitted.guestEmail || ""), event: event.title, registrationId: admitted.id } }));

  return NextResponse.json({
    success: true, status: "CHECKED_IN",
    message: "Checked in successfully!",
    attendee: { ...registration, status: "CHECKED_IN", checkedInAt: now.toISOString() },
  });
}

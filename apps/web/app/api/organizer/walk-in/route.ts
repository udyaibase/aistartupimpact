import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { generateQrToken } from "@/lib/events/qr-token";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { eventRegistrationHtml } from "@udyaibase/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/walk-in — Register a walk-in attendee manually
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("registrations.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { eventId, name, email, phone, company, emailConsent } = await request.json();
  if (!eventId || !name || !email) return NextResponse.json({ success: false, error: "Name and email required" }, { status: 400 });

  if (!canAccessEvent(session, eventId)) {
    return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });
  }

  // Verify organizer owns event
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId: session.organizerId, deletedAt: null },
    select: { id: true, title: true, slug: true, startAt: true, endAt: true, timezone: true, venueName: true, address: true, format: true, capacity: true, registrationCount: true },
  });
  if (!event) return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });

  // Check capacity
  if (event.capacity && event.registrationCount >= event.capacity) {
    return NextResponse.json({ success: false, error: "Event is full" }, { status: 400 });
  }

  // Check duplicate
  const existing = await prisma.eventRegistration.findFirst({ where: { eventId, guestEmail: email, deletedAt: null } });
  if (existing) return NextResponse.json({ success: false, error: "Already registered", qrToken: existing.qrToken }, { status: 409 });

  const qrToken = generateQrToken(16);
  const reg = await prisma.eventRegistration.create({
    data: {
      eventId, guestName: name, guestEmail: email, guestPhone: phone || null,
      guestCompany: company || null, status: "CONFIRMED", qrToken,
      registrationSource: "WALK_IN",
    },
  });

  // Only send confirmation email if organizer confirmed attendee consent
  if (!emailConsent) {
    return NextResponse.json({ success: true, data: { id: reg.id, qrToken: reg.qrToken } });
  }

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";
  const tz = event.timezone || "Asia/Kolkata";
  const dateStr = event.startAt ? new Date(event.startAt).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz }) : "TBA";
  const timeStr = event.startAt ? new Date(event.startAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : "TBA";

  const gcalStart = event.startAt ? new Date(event.startAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "") : "";
  const gcalEnd = event.endAt ? new Date(event.endAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "") : gcalStart;
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${gcalStart}/${gcalEnd}&location=${encodeURIComponent(event.venueName || "")}&details=${encodeURIComponent(`${SITE_URL}/events/${event.slug}`)}`;

  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";
  sendEmailFireAndForget({
    to: email,
    from: `Udyaibase Events <${FROM_EMAIL}>`,
    subject: `You're registered! ${event.title}`,
    html: eventRegistrationHtml(name, {
      eventTitle: event.title,
      eventSlug: event.slug,
      eventDate: dateStr,
      eventTime: timeStr,
      eventTimezone: tz,
      venueName: event.venueName || undefined,
      address: event.address || undefined,
      format: event.format,
      qrToken,
      googleCalendarUrl,
    }),
    type: "event_registration",
  });

  return NextResponse.json({ success: true, data: { id: reg.id, qrToken: reg.qrToken } });
}

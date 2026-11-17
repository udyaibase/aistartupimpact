import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { generateQrToken } from "@/lib/events/qr-token";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { eventRegistrationHtml } from "@udyaibase/utils";
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from "@/lib/rate-limit";
import { logOrganizerActivity, organizerActor } from "@/lib/workspace-activity";
import { maskEmail } from "@/lib/mask";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/walk-in — Register a walk-in attendee manually
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("registrations.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { success: allowed, reset } = await checkRateLimit(apiRateLimit, `walk-in:${session.organizerId}`);
  if (!allowed) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  const body = await request.json().catch(() => ({}));
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 20) : "";
  const company = typeof body.company === "string" ? body.company.trim().slice(0, 120) : "";
  const emailConsent = body.emailConsent === true;
  if (!eventId || !name || !email) return NextResponse.json({ success: false, error: "Name and email required" }, { status: 400 });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 });

  if (!canAccessEvent(session, eventId)) {
    return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });
  }

  // Verify organizer owns event
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId: session.organizerId, deletedAt: null },
    select: { id: true, title: true, slug: true, startAt: true, endAt: true, timezone: true, venueName: true, address: true, venueMapUrl: true, format: true, capacity: true, registrationCount: true },
  });
  if (!event) return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });

  // Check capacity
  if (event.capacity && event.registrationCount >= event.capacity) {
    return NextResponse.json({ success: false, error: "Event is full" }, { status: 400 });
  }

  // Check duplicate
  const existing = await prisma.eventRegistration.findFirst({ where: { eventId, guestEmail: { equals: email, mode: "insensitive" }, deletedAt: null } });
  if (existing) return NextResponse.json({ success: false, error: "Already registered", qrToken: existing.qrToken }, { status: 409 });

  // One statement: FOR UPDATE serialises with online registrations on the event row, and the row is only inserted
  // while there is room, so two walk-ins at the door can't both take the last seat (see lib/events/register-event.ts).
  const qrToken = generateQrToken(16);
  let rows: { id: string; qrToken: string }[];
  try {
    rows = await prisma.$queryRaw<{ id: string; qrToken: string }[]>`
      WITH e AS (
        SELECT id, capacity, "registrationCount" FROM "Event" WHERE id = ${eventId} FOR UPDATE
      )
      INSERT INTO "EventRegistration" (
        id, "eventId", "guestName", "guestEmail", "guestPhone", "guestCompany", status, "qrToken", "registrationSource", "updatedAt"
      )
      SELECT gen_random_uuid(), e.id, ${name}, ${email}, ${phone || null}, ${company || null}, 'CONFIRMED'::"RegistrationStatus", ${qrToken}, 'WALK_IN', NOW()
      FROM e
      WHERE e.capacity IS NULL OR e."registrationCount" < e.capacity
      RETURNING id, "qrToken"`;
  } catch (err) {
    if (String((err as Error)?.message).includes("23505")) {
      return NextResponse.json({ success: false, error: "This email is already registered for this event." }, { status: 409 });
    }
    throw err;
  }
  if (!rows.length) return NextResponse.json({ success: false, error: "Event is full" }, { status: 400 });
  const reg = rows[0];

  await logOrganizerActivity(session.organizerId, "registrations_changed", { actor: organizerActor(session), request, metadata: { what: `Added a walk-in (${maskEmail(email)})`, event: event.title } });

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
      address: event.address?.split("|||")[0] || undefined,
      mapUrl: event.venueMapUrl || undefined,
      format: event.format,
      qrToken,
      googleCalendarUrl,
    }),
    type: "event_registration",
  });

  return NextResponse.json({ success: true, data: { id: reg.id, qrToken: reg.qrToken } });
}

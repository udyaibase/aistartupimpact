import { NextRequest, NextResponse } from "next/server";
import { refundTicket } from "@/lib/events/tickets";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { registrationRejectedHtml } from "@udyaibase/utils";
import { sendConfirmationEmail } from "@/lib/events/register-event";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { refreshPaths } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

type BulkAction = "approve" | "reject" | "promote" | "cancel";

export async function POST(request: NextRequest) {
  const result = await requirePermission("registrations.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { registrationIds, action } = (await request.json()) as {
    registrationIds: string[];
    action: BulkAction;
  };

  if (!registrationIds?.length || !action) {
    return NextResponse.json({ success: false, error: "registrationIds and action are required" }, { status: 400 });
  }

  if (!["approve", "reject", "promote", "cancel"].includes(action)) {
    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  }

  if (registrationIds.length > 200) {
    return NextResponse.json({ success: false, error: "Max 200 registrations per batch" }, { status: 400 });
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: { id: { in: registrationIds }, deletedAt: null },
    include: {
      event: {
        select: { id: true, organizerId: true, title: true, slug: true, startAt: true, timezone: true },
      },
    },
  });

  const unauthorized = registrations.filter(r => r.event.organizerId !== session.organizerId || !canAccessEvent(session, r.eventId));
  if (unauthorized.length > 0) {
    return NextResponse.json({ success: false, error: "Not authorized for some registrations" }, { status: 403 });
  }

  let updated = 0;
  const errors: string[] = [];
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";

  for (const reg of registrations) {
    const tz = reg.event.timezone || "Asia/Kolkata";
    const dateStr = reg.event.startAt
      ? new Date(reg.event.startAt).toLocaleDateString("en-IN", {
          weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz,
        })
      : "TBA";

    try {
      if (action === "approve" && reg.status === "PENDING_APPROVAL") {
        await prisma.eventRegistration.update({
          where: { id: reg.id },
          data: { status: "CONFIRMED" },
        });
        // Their ticket (QR) goes out now; it was held back while the request was pending.
        if (reg.guestEmail) sendConfirmationEmail(reg.eventId, reg.guestEmail, reg.guestName || "there", reg.qrToken).catch(() => {});
        updated++;
      } else if (action === "reject" && reg.status === "PENDING_APPROVAL") {
        await prisma.eventRegistration.update({
          where: { id: reg.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        if (reg.guestEmail) {
          sendEmailFireAndForget({
            to: reg.guestEmail,
            from: `Udyaibase Events <${FROM_EMAIL}>`,
            subject: `Registration Update: ${reg.event.title}`,
            html: registrationRejectedHtml(reg.guestName || "there", reg.event.title, dateStr),
            type: "registration_rejected",
          });
        }
        updated++;
      } else if (action === "promote" && reg.status === "WAITLISTED") {
        await prisma.eventRegistration.update({
          where: { id: reg.id },
          data: { status: "CONFIRMED", waitlistReason: null },
        });
        if (reg.guestEmail) sendConfirmationEmail(reg.eventId, reg.guestEmail, reg.guestName || "there", reg.qrToken).catch(() => {});
        updated++;
      } else if (action === "cancel" && !["CANCELLED", "CHECKED_IN"].includes(reg.status)) {
        const wasConfirmed = reg.status === "CONFIRMED";
        // A paid ticket is cancelled by refunding it in full; if the refund fails, nothing changes.
        if (reg.paymentStatus === "PAID") {
          const r = await refundTicket(reg.id, "host");
          if (!r.ok) { errors.push(`${reg.guestEmail}: ${r.error}`); continue; }
        }

        // Atomic cancel + auto-promote in a transaction
        const promoted = await prisma.$transaction(async (tx) => {
          await tx.eventRegistration.update({
            where: { id: reg.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          });

          if (!wasConfirmed) return null;

          // Lock and promote next waitlisted person atomically
          const [next] = await tx.$queryRawUnsafe<{ id: string; guestName: string | null; guestEmail: string | null; qrToken: string }[]>(
            `UPDATE "EventRegistration" SET status = 'CONFIRMED', "waitlistReason" = NULL
             WHERE id = (
               SELECT id FROM "EventRegistration"
               WHERE "eventId" = $1 AND status = 'WAITLISTED' AND "deletedAt" IS NULL
               ORDER BY "registeredAt" ASC
               LIMIT 1
               FOR UPDATE SKIP LOCKED
             )
             RETURNING id, "guestName", "guestEmail", "qrToken"`,
            reg.eventId,
          );
          return next || null;
        });

        updated++;

        if (promoted?.guestEmail) sendConfirmationEmail(reg.eventId, promoted.guestEmail, promoted.guestName || "there", promoted.qrToken).catch(() => {});
      } else {
        errors.push(`${reg.id}: invalid status transition from ${reg.status}`);
      }
    } catch (err: any) {
      errors.push(`${reg.id}: ${err.message}`);
    }
  }

  if (updated) refreshPaths([...new Set(registrations.map((r) => `/events/${r.event.slug}`))]);
  return NextResponse.json({ success: true, updated, errors: errors.length > 0 ? errors : undefined });
}

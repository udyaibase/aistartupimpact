import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { logOrganizerActivity, organizerActor } from "@/lib/workspace-activity";
import { RESTORE_DAYS } from "@/lib/events/restore";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/events/[eventId]/restore — bring back an event deleted in the last 30 days.
 *
 * Deleting told attendees the event was cancelled and refunded paid tickets, so a restored event comes back as a
 * draft with those registrations cancelled: nobody is sent reminders for an event they were told was off. The host
 * publishes it again and invites people afresh.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const result = await requirePermission("events.delete");
  if (result instanceof NextResponse) return result;
  if (!canAccessEvent(result, eventId)) return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId: result.organizerId, deletedAt: { not: null } },
    select: { id: true, title: true, status: true, deletedAt: true, organizer: { select: { deletedAt: true } } },
  });
  if (!event || event.organizer.deletedAt) return NextResponse.json({ success: false, error: "Deleted event not found." }, { status: 404 });
  if (Date.now() - event.deletedAt!.getTime() > RESTORE_DAYS * 864e5) {
    return NextResponse.json({ success: false, error: `Events can be restored for ${RESTORE_DAYS} days after they’re deleted.` }, { status: 410 });
  }

  const wasLive = event.status !== "DRAFT";
  const now = new Date();
  const cancelled = await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: event.id }, data: { deletedAt: null, ...(wasLive ? { status: "DRAFT", publishedAt: null } : {}) } });
    if (!wasLive) return { count: 0 };
    return tx.eventRegistration.updateMany({
      where: { eventId: event.id, deletedAt: null, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", cancelledAt: now },
    });
  });
  await logOrganizerActivity(result.organizerId, "event_restored", { actor: organizerActor(result), request, metadata: { title: event.title } });

  return NextResponse.json({
    success: true,
    message: wasLive
      ? `Restored as a draft.${cancelled.count ? ` Its ${cancelled.count} registration${cancelled.count === 1 ? " was" : "s were"} cancelled when it was deleted.` : ""} Publish it again when you’re ready.`
      : "Restored as a draft.",
  });
}

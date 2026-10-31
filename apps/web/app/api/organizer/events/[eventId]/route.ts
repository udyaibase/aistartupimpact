import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { eventCancellationHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { sanitizeUserHtml, htmlToPlainText } from "@/lib/sanitize";
import { featuredUntilFor, upcomingLimitProblem } from "@/lib/events/billing";
import { canSellTickets } from "@/lib/events/payouts";
import { refundEventTickets } from "@/lib/events/tickets";
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { applyFirstEventBoost } from "@/lib/events/free-boost";

class TierError extends Error {}

export const dynamic = "force-dynamic";

/**
 * DELETE /api/organizer/events/[eventId] — Soft-delete an event
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const result = await requirePermission("events.delete");
  if (result instanceof NextResponse) return result;
  const session = result;

  if (!canAccessEvent(session, params.eventId)) {
    return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
    select: { organizerId: true, title: true, startAt: true, timezone: true },
  });
  if (!event) return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
  if (event.organizerId !== session.organizerId) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

  // Fetch confirmed attendees before soft-deleting
  const attendees = await prisma.eventRegistration.findMany({
    where: { eventId: params.eventId, deletedAt: null, status: { in: ["CONFIRMED", "CHECKED_IN", "PENDING_APPROVAL"] } },
    select: { guestEmail: true, guestName: true },
  });

  await prisma.event.update({ where: { id: params.eventId }, data: { deletedAt: new Date() } });
  // Paid tickets are refunded in full (the host's share is reversed too).
  after(() => refundEventTickets(params.eventId).then((r) => { if (r.paid) console.log(`[event delete] refunded ${r.refunded}/${r.paid} tickets`); }));

  // Notify attendees about cancellation
  if (attendees.length > 0) {
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";
    const tz = event.timezone || "Asia/Kolkata";
    const dateStr = event.startAt
      ? new Date(event.startAt).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz })
      : "TBA";

    for (const attendee of attendees) {
      if (!attendee.guestEmail) continue;
      sendEmailFireAndForget({
        to: attendee.guestEmail,
        from: `Udyaibase Events <${FROM_EMAIL}>`,
        subject: `Event Cancelled: ${event.title}`,
        html: eventCancellationHtml(attendee.guestName || "there", event.title, dateStr),
        type: "event_cancellation",
      });
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * PUT /api/organizer/events/[eventId] — Update an event
 */
export async function PUT(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const result = await requirePermission("events.edit");
  if (result instanceof NextResponse) return result;
  const session = result;

  if (!canAccessEvent(session, params.eventId)) {
    return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.eventId, deletedAt: null },
    select: { organizerId: true, slug: true, title: true, startAt: true, endAt: true, status: true },
  });
  if (!event) return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
  if (event.organizerId !== session.organizerId) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

  const data = await request.json();

  if (data.status !== undefined && !EVENT_STATUSES.includes(data.status)) {
    return NextResponse.json({ success: false, error: "Unknown event status." }, { status: 400 });
  }
  if (data.status === "PUBLISHED" && event.status !== "PUBLISHED") {
    const limit = await upcomingLimitProblem(session.organizerId, params.eventId);
    if (limit) return NextResponse.json({ success: false, code: "plan_limit", error: limit }, { status: 403 });
  }
  if (data.status === "PUBLISHED") {
    const problems = publishProblems({
      title: data.title ?? event.title,
      startAt: data.startAt ? new Date(data.startAt) : event.startAt,
      endAt: data.endAt ? new Date(data.endAt) : event.endAt,
    });
    if (problems.length > 0) {
      return NextResponse.json(
        { success: false, code: "not_publishable", problems, error: `Can't publish yet: ${problems.join(" ")}` },
        { status: 422 },
      );
    }
  }

  // Publishing on Pro: featured until the event ends (never shortens a Boost).
  const proFeatured = data.status === "PUBLISHED" && event.status !== "PUBLISHED"
    ? await featuredUntilFor(session.organizerId, data.endAt ? new Date(data.endAt) : event.endAt)
    : null;

  // Paid tickets need an activated payout account.
  if (Array.isArray(data.ticketTiers) && data.ticketTiers.some((t: any) => Number(t.priceRupees) > 0) && !(await canSellTickets(session.organizerId))) {
    return NextResponse.json({ success: false, code: "payouts_required", error: "Set up payouts in Settings → Payments before selling paid tickets." }, { status: 400 });
  }

  try {
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: params.eventId },
      data: {
        title: data.title || undefined,
        subtitle: data.subtitle !== undefined ? data.subtitle : undefined,
        category: data.category || undefined,
        format: data.format || undefined,
        startAt: data.startAt ? new Date(data.startAt) : undefined,
        endAt: data.endAt ? new Date(data.endAt) : undefined,
        timezone: data.timezone || undefined,
        venueName: data.venueName !== undefined ? data.venueName : undefined,
        address: data.address !== undefined ? data.address : undefined,
        meetingLink: data.meetingLink !== undefined ? data.meetingLink : undefined,
        description: data.description !== undefined ? (data.description ? { html: sanitizeUserHtml(String(data.description)), text: htmlToPlainText(String(data.description)) } : undefined) : undefined,
        capacity: data.capacity !== undefined ? (data.capacity ? parseInt(data.capacity) : null) : undefined,
        coverImageUrl: data.coverImageUrl !== undefined ? data.coverImageUrl : undefined,
        visibility: data.visibility || undefined,
        status: data.status || undefined,
        approvalRequired: data.approvalRequired !== undefined ? data.approvalRequired : undefined,
        metaTitle: data.seoTitle !== undefined ? data.seoTitle : undefined,
        metaDescription: data.seoDescription !== undefined ? data.seoDescription : undefined,
      },
    });
    if (proFeatured) {
      await tx.event.updateMany({ where: { id: params.eventId, OR: [{ featuredUntil: null }, { featuredUntil: { lt: proFeatured } }] }, data: { featuredUntil: proFeatured } });
    }

    // Replace speakers
    if (data.speakers !== undefined) {
      await tx.eventSpeaker.deleteMany({ where: { eventId: params.eventId } });
      if (data.speakers.length > 0) {
        await tx.eventSpeaker.createMany({
          data: data.speakers.map((s: any, i: number) => ({
            eventId: params.eventId,
            name: s.name,
            title: s.title || null,
            company: s.company || null,
            headshotUrl: s.photo || null,
            bio: s.linkedin || null,
            sortOrder: i,
          })),
        });
      }
    }

    // Replace agenda items
    if (data.agenda !== undefined) {
      await tx.eventAgendaItem.deleteMany({ where: { eventId: params.eventId } });
      if (data.agenda.length > 0) {
        await tx.eventAgendaItem.createMany({
          data: data.agenda.map((a: any, i: number) => ({
            eventId: params.eventId,
            startTime: a.time || "",
            endTime: "",
            title: a.title,
            description: a.speaker || null,
            sortOrder: i,
          })),
        });
      }
    }

    // Ticket tiers: update in place by id (registrations keep their tier), create new ones,
    // and remove only tiers nobody has registered for.
    if (data.ticketTiers !== undefined) {
      const existing = await tx.eventTicketTier.findMany({
        where: { eventId: params.eventId },
        select: { id: true, priceCents: true, _count: { select: { registrations: { where: { deletedAt: null, status: { not: "CANCELLED" } } } } } },
      });
      const incoming: any[] = Array.isArray(data.ticketTiers) ? data.ticketTiers : [];
      const keep = new Set(incoming.map((t) => t.id).filter(Boolean));
      for (const e of existing) {
        if (keep.has(e.id)) continue;
        if (e._count.registrations > 0) throw new TierError("A ticket type that people have registered for can't be removed. Set its quantity to stop new sales instead.");
        await tx.eventTicketTier.delete({ where: { id: e.id } });
      }
      for (const t of incoming) {
        const price = Math.max(0, Math.round(Number(t.priceRupees ?? 0) * 100));
        const fields = {
          name: String(t.name || "General").slice(0, 60), tierType: t.type || "REGULAR",
          quantity: t.quantity ? parseInt(t.quantity) : null, description: t.description || null, priceCents: price,
        };
        const prev = existing.find((e) => e.id === t.id);
        if (prev) {
          if (prev.priceCents !== price && prev._count.registrations > 0 && (prev.priceCents > 0 || price > 0)) {
            throw new TierError(`The price of "${fields.name}" can't change after people have registered. Add a new ticket type instead.`);
          }
          await tx.eventTicketTier.update({ where: { id: prev.id }, data: fields });
        } else {
          await tx.eventTicketTier.create({ data: { ...fields, eventId: params.eventId } });
        }
      }
    }

    // Replace custom questions
    if (data.customQuestions !== undefined) {
      await tx.eventCustomQuestion.deleteMany({ where: { eventId: params.eventId } });
      if (data.customQuestions.length > 0) {
        await tx.eventCustomQuestion.createMany({
          data: data.customQuestions.map((q: any, i: number) => ({
            eventId: params.eventId,
            questionText: q.text,
            questionType: q.type || "TEXT",
            required: q.required || false,
            options: q.type === "SELECT" && q.options ? q.options.split(",").map((o: string) => o.trim()) : undefined,
            sortOrder: i,
          })),
        });
      }
    }
  });
  } catch (err) {
    if (err instanceof TierError) return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    throw err;
  }

  if (data.status === "CANCELLED" && event.status !== "CANCELLED") {
    after(() => refundEventTickets(params.eventId).then((r) => { if (r.paid) console.log(`[event cancel] refunded ${r.refunded}/${r.paid} tickets`); }));
  }

  // First event a host publishes gets the free Event Boost.
  if (data.status === "PUBLISHED" && event.status !== "PUBLISHED") {
    await applyFirstEventBoost(session.organizerId, params.eventId).catch((e) => console.error("[free boost]", e));
  }

  // Lists and the homepage's upcoming events, plus this event's page.
  refreshSections(["events", "home"]);
  refreshPaths([`/events/${event.slug}`]);

  return NextResponse.json({ success: true, data: { status: data.status } });
}

const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED", "POSTPONED", "COMPLETED", "ARCHIVED"];

function publishProblems(e: { title: string | null; startAt: Date | null; endAt: Date | null }): string[] {
  const problems: string[] = [];
  if (!e.title?.trim()) problems.push("Add a title.");
  if (!e.startAt || !e.endAt || isNaN(e.startAt.getTime()) || isNaN(e.endAt.getTime())) {
    problems.push("Set a start and end date.");
  } else if (e.endAt <= e.startAt) {
    problems.push("The end time must be after the start time.");
  } else if (e.endAt.getTime() < Date.now()) {
    problems.push("This event has already ended. Move it to a future date to publish it.");
  }
  return problems;
}

/**
 * GET /api/organizer/events/[eventId] — Get event details
 */
export async function GET(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const result = await requirePermission("events.view");
  if (result instanceof NextResponse) return result;
  const session = result;

  if (!canAccessEvent(session, params.eventId)) {
    return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.eventId, deletedAt: null },
    include: {
      speakers: { orderBy: { sortOrder: "asc" } },
      agendaItems: { orderBy: { sortOrder: "asc" } },
      ticketTiers: { orderBy: { createdAt: "asc" } },
      customQuestions: { orderBy: { sortOrder: "asc" } },
      registrations: { where: { deletedAt: null }, orderBy: { registeredAt: "desc" }, select: { id: true, guestName: true, guestEmail: true, guestOccupation: true, status: true, registeredAt: true } },
    },
  });

  if (!event) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (event.organizerId !== session.organizerId) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

  return NextResponse.json({ success: true, event });
}

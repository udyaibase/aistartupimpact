import { NextRequest, NextResponse, after } from "next/server";
import { hasPermission } from "@/lib/organizer-auth/permissions";
import { descriptionTooLong, DESCRIPTION_TOO_LONG } from "@/lib/events/description-limit";
import { cleanTimeZone } from "@/lib/events/zoned-time";
import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@udyaibase/database";
import { requirePermission, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { eventCancellationHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { sanitizeUserHtml, htmlToPlainText } from "@/lib/sanitize";
import { featuredUntilFor, upcomingLimitProblem } from "@/lib/events/billing";
import { canSellTickets } from "@/lib/events/payouts";
import { refundEventTickets } from "@/lib/events/tickets";
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { applyFirstEventBoost } from "@/lib/events/free-boost";
import { canTagStartup, publishDecision } from "@/lib/events/trust";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { syncEventMeeting } from "@/lib/integrations/meetings";
import { isProvider } from "@/lib/integrations/providers";
import { meetingProofValid } from "@/lib/integrations/meeting-proof";
import { cleanEventInput } from "@/lib/events/event-input";

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
    select: { organizerId: true, title: true, startAt: true, timezone: true, status: true },
  });
  if (!event) return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
  if (event.organizerId !== session.organizerId) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

  await prisma.event.update({ where: { id: params.eventId }, data: { deletedAt: new Date() } });
  await logOrganizerActivity(session.organizerId, "event_deleted", { actor: organizerActor(session), request, metadata: { title: event.title ?? "" } });
  // Paid tickets are refunded in full (the host's share is reversed too).
  after(() => refundEventTickets(params.eventId).then((r) => { if (r.paid) console.log(`[event delete] refunded ${r.refunded}/${r.paid} tickets`); }));

  // Notify attendees about cancellation (not for an event that was already cancelled: they were told then).
  if (event.status !== "CANCELLED") await notifyCancelled(params.eventId, event.title, event.startAt, event.timezone);

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
    select: { organizerId: true, slug: true, title: true, startAt: true, endAt: true, timezone: true, status: true, startupId: true, heldAt: true, meetingExternalId: true, meetingProvider: true },
  });
  if (!event) return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
  if (event.organizerId !== session.organizerId) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

  const cleaned = cleanEventInput(await request.json().catch(() => null));
  if (!cleaned.ok) return NextResponse.json({ success: false, field: cleaned.field, error: cleaned.error }, { status: 400 });
  const data = cleaned.data;
  // A meeting id is taken only when it's the one the event already has, or this workspace just created it.
  if (typeof data.meetingExternalId === "string" && data.meetingExternalId
    && !(data.meetingExternalId === event.meetingExternalId && data.meetingProvider === event.meetingProvider)
    && !meetingProofValid(session.organizerId, data.meetingProvider, data.meetingExternalId, data.meetingProof)) {
    data.meetingProvider = null;
    data.meetingExternalId = null;
  }

  if (data.status !== undefined && !EVENT_STATUSES.includes(data.status)) {
    return NextResponse.json({ success: false, error: "Unknown event status." }, { status: 400 });
  }
  // Cancelling refunds every paid ticket and can't be undone, so it needs the same role as deleting.
  if (data.status === "CANCELLED" && event.status !== "CANCELLED" && !hasPermission(session.role, "events.delete")) {
    return NextResponse.json({ success: false, error: "Only the owner or an admin can cancel an event." }, { status: 403 });
  }

  // "Hosted by <startup>": only a verified startup, tagged by one of its own people. null removes the tag.
  let startupTag: string | null | undefined;
  if (data.startupId !== undefined) {
    startupTag = data.startupId ? String(data.startupId) : null;
    if (startupTag && startupTag !== event.startupId) {
      const host = await prisma.eventOrganizer.findUnique({ where: { id: session.organizerId }, select: { email: true } });
      if (!(await canTagStartup([session.email, host?.email ?? ''], startupTag))) {
        return NextResponse.json({ success: false, code: "startup_not_allowed", error: "You can only tag a verified startup you belong to." }, { status: 403 });
      }
    }
  }

  // Review: an event waiting for review (or hidden after reports) is released only by an admin; other edits still save.
  // Publishing otherwise follows the same rule as creating: verified organizers and startups publish at once.
  let nextStatus: string | undefined = data.status;
  if (nextStatus === "PUBLISHED" && event.status !== "PUBLISHED") {
    if (event.status === "PENDING_REVIEW") nextStatus = undefined;
    else if (event.heldAt) nextStatus = "PENDING_REVIEW";
    else if ((await publishDecision(session.organizerId, { taggedStartup: !!(startupTag === undefined ? event.startupId : startupTag) })) === "PENDING_REVIEW") nextStatus = "PENDING_REVIEW";
  }
  if (event.heldAt && nextStatus && !["DRAFT", "CANCELLED", "PENDING_REVIEW"].includes(nextStatus)) nextStatus = undefined;
  const goingLive = nextStatus === "PUBLISHED" && event.status !== "PUBLISHED";
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
  const proFeatured = goingLive
    ? await featuredUntilFor(session.organizerId, data.endAt ? new Date(data.endAt) : event.endAt)
    : null;

  // Paid tickets need an activated payout account.
  if (Array.isArray(data.ticketTiers) && data.ticketTiers.some((t: any) => Number(t.priceRupees) > 0) && !(await canSellTickets(session.organizerId))) {
    return NextResponse.json({ success: false, code: "payouts_required", error: "Set up payouts in Settings → Payments before selling paid tickets." }, { status: 400 });
  }

    if (descriptionTooLong(data.description)) {
      return NextResponse.json({ success: false, field: "description", error: DESCRIPTION_TOO_LONG }, { status: 400 });
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
        timezone: data.timezone ? cleanTimeZone(data.timezone) : undefined,
        venueName: data.venueName !== undefined ? data.venueName : undefined,
        address: data.address !== undefined ? data.address : undefined,
        venueMapUrl: data.venueMapUrl !== undefined ? data.venueMapUrl : undefined,
        meetingLink: data.meetingLink !== undefined ? data.meetingLink : undefined,
        // A meeting made with a connected Zoom/Google account; any other link clears it.
        ...(data.meetingLink !== undefined && {
          meetingProvider: data.meetingLink && isProvider(data.meetingProvider) && typeof data.meetingExternalId === "string" ? data.meetingProvider : null,
          meetingExternalId: data.meetingLink && isProvider(data.meetingProvider) && typeof data.meetingExternalId === "string" ? data.meetingExternalId.slice(0, 200) : null,
        }),
        description: data.description !== undefined ? (data.description ? { html: sanitizeUserHtml(String(data.description)), text: htmlToPlainText(String(data.description)) } : undefined) : undefined,
        capacity: data.capacity !== undefined ? (data.capacity ? parseInt(data.capacity) : null) : undefined,
        coverImageUrl: data.coverImageUrl !== undefined ? data.coverImageUrl : undefined,
        visibility: data.visibility || undefined,
        status: (nextStatus as "PUBLISHED" | undefined) || undefined,
        ...(startupTag !== undefined ? { startupId: startupTag } : {}),
        ...(goingLive ? { publishedAt: new Date() } : {}),
        ...(nextStatus === "PENDING_REVIEW" && event.status !== "PENDING_REVIEW" ? { reviewNote: event.heldAt ? undefined : "First event from a new organizer" } : {}),
        approvalRequired: data.approvalRequired !== undefined ? data.approvalRequired : undefined,
        metaTitle: data.seoTitle !== undefined ? data.seoTitle : undefined,
        metaDescription: data.seoDescription !== undefined ? data.seoDescription : undefined,
      },
    });
    if (proFeatured) {
      await tx.event.updateMany({ where: { id: params.eventId, OR: [{ featuredUntil: null }, { featuredUntil: { lt: proFeatured } }] }, data: { featuredUntil: proFeatured } });
    }

    // Speakers: update in place (matched by id, or by name for older forms), so a renamed speaker keeps their id,
    // agenda sessions and talk details; add new, remove gone.
    if (data.speakers !== undefined) {
      const existing = await tx.eventSpeaker.findMany({ where: { eventId: params.eventId }, select: { id: true, name: true } });
      const ids = new Set(existing.map((e) => e.id));
      const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e.id]));
      const kept = new Set<string>();
      for (const [i, s] of (data.speakers as any[]).entries()) {
        const fields = { name: s.name, title: s.title || null, company: s.company || null, headshotUrl: s.photo || null, bio: s.linkedin || null, sortOrder: i };
        const id = typeof s.id === "string" && ids.has(s.id) && !kept.has(s.id) ? s.id : byName.get(String(s.name ?? '').trim().toLowerCase());
        if (id && !kept.has(id)) {
          kept.add(id);
          await tx.eventSpeaker.update({ where: { id }, data: fields });
        } else {
          await tx.eventSpeaker.create({ data: { eventId: params.eventId, ...fields } });
        }
      }
      const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
      if (gone.length) await tx.eventSpeaker.deleteMany({ where: { id: { in: gone }, eventId: params.eventId } });
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

    // Custom questions: update in place by id, so answers people already gave stay linked. A removed question is
    // deleted only if nobody answered it; otherwise it's hidden (no longer asked, answers kept for exports).
    if (data.customQuestions !== undefined) {
      const existing = await tx.eventCustomQuestion.findMany({
        where: { eventId: params.eventId, hiddenAt: null },
        select: { id: true, _count: { select: { answers: true } } },
      });
      const ids = new Set(existing.map((e) => e.id));
      const kept = new Set<string>();
      for (const [i, q] of (data.customQuestions as any[]).entries()) {
        const fields = {
          questionText: q.text,
          questionType: q.type || "TEXT",
          required: q.required || false,
          options: q.type === "SELECT" && q.options ? String(q.options).split(",").map((o: string) => o.trim()).filter(Boolean) : undefined,
          sortOrder: i,
        };
        if (typeof q.id === "string" && ids.has(q.id) && !kept.has(q.id)) {
          kept.add(q.id);
          await tx.eventCustomQuestion.update({ where: { id: q.id }, data: { ...fields, options: fields.options ?? Prisma.DbNull } });
        } else {
          await tx.eventCustomQuestion.create({ data: { eventId: params.eventId, ...fields } });
        }
      }
      for (const e of existing) {
        if (kept.has(e.id)) continue;
        if (e._count.answers > 0) await tx.eventCustomQuestion.update({ where: { id: e.id }, data: { hiddenAt: new Date() } });
        else await tx.eventCustomQuestion.delete({ where: { id: e.id } });
      }
    }
  });
  } catch (err) {
    if (err instanceof TierError) return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    throw err;
  }

  // Move the Zoom / Google meeting when the time or title changed (it was made for the old ones).
  const timeChanged = (data.startAt && new Date(data.startAt).getTime() !== event.startAt.getTime())
    || (data.endAt && new Date(data.endAt).getTime() !== event.endAt.getTime())
    || (data.title && data.title !== event.title)
    || (data.timezone && cleanTimeZone(data.timezone) !== event.timezone);
  if (timeChanged && (event.meetingExternalId || (typeof data.meetingExternalId === "string" && data.meetingExternalId))) {
    after(() => syncEventMeeting(params.eventId));
  }

  if (data.status === "CANCELLED" && event.status !== "CANCELLED") {
    // Everyone registered is told, the same as when an event is deleted.
    await notifyCancelled(params.eventId, event.title, event.startAt, event.timezone);
    after(() => refundEventTickets(params.eventId).then((r) => { if (r.paid) console.log(`[event cancel] refunded ${r.refunded}/${r.paid} tickets`); }));
  }

  // First event a host publishes gets the free Event Boost.
  if (goingLive) {
    await applyFirstEventBoost(session.organizerId, params.eventId).catch((e) => console.error("[free boost]", e));
  }

  // Lists and the homepage's upcoming events, plus this event's page.
  refreshSections(["events", "home"]);
  refreshPaths([`/events/${event.slug}`]);

  const cancelled = data.status === "CANCELLED" && event.status !== "CANCELLED";
  await logOrganizerActivity(session.organizerId, cancelled ? "event_cancelled" : goingLive ? "event_published" : "event_updated", {
    actor: organizerActor(session), request, metadata: { title: String(data.title || event.title || "") },
  });

  return NextResponse.json({
    success: true,
    data: { status: nextStatus ?? event.status },
    ...(nextStatus === "PENDING_REVIEW" ? { message: "Your event is waiting for a quick review by our team (usually within a day). We'll email you when it's live." } : {}),
  });
}

/** Tell everyone still registered that the event is off. */
async function notifyCancelled(eventId: string, title: string, startAt: Date | null, timezone: string | null) {
  const attendees = await prisma.eventRegistration.findMany({
    where: { eventId, deletedAt: null, status: { in: ["CONFIRMED", "CHECKED_IN", "PENDING_APPROVAL", "WAITLISTED"] } },
    select: { guestEmail: true, guestName: true },
  });
  if (!attendees.length) return;
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";
  const dateStr = startAt
    ? new Date(startAt).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: timezone || "Asia/Kolkata" })
    : "TBA";
  for (const attendee of attendees) {
    if (!attendee.guestEmail) continue;
    sendEmailFireAndForget({
      to: attendee.guestEmail,
      from: `Udyaibase Events <${FROM_EMAIL}>`,
      subject: `Event Cancelled: ${title}`,
      html: eventCancellationHtml(attendee.guestName || "there", title, dateStr),
      type: "event_cancellation",
    });
  }
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
      customQuestions: { where: { hiddenAt: null }, orderBy: { sortOrder: "asc" } },
      // Attendees' names and emails only for roles that may see attendees (not Check-in).
      ...(hasPermission(session.role, "registrations.view")
        ? { registrations: { where: { deletedAt: null }, orderBy: { registeredAt: "desc" as const }, select: { id: true, guestName: true, guestEmail: true, guestOccupation: true, status: true, registeredAt: true } } }
        : {}),
    },
  });

  if (!event) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (event.organizerId !== session.organizerId) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

  // Staff and Check-in can look but not change: the page shows a read-only view (saving is refused anyway).
  return NextResponse.json({
    success: true, event,
    canEdit: hasPermission(session.role, "events.edit"),
    canViewAttendees: hasPermission(session.role, "registrations.view"),
  });
}

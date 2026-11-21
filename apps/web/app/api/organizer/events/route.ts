import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';
import { NextRequest, NextResponse } from "next/server";
import { createEventParts, hasPaidTickets, planAgenda } from "@/lib/events/new-event-parts";
import { canSellTickets } from "@/lib/events/payouts";
import { isProvider } from "@/lib/integrations/providers";
import { meetingProofValid } from "@/lib/integrations/meeting-proof";
import { descriptionTooLong, DESCRIPTION_TOO_LONG } from "@/lib/events/description-limit";
import { cleanTimeZone } from "@/lib/events/zoned-time";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { featuredUntilFor, upcomingLimitProblem } from "@/lib/events/billing";
import { generateShortCode, isSlugReserved } from "@/lib/events/short-code";
import { sanitizeUserHtml, htmlToPlainText } from "@/lib/sanitize";
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { applyFirstEventBoost } from "@/lib/events/free-boost";
import { canTagStartup, publishDecision } from "@/lib/events/trust";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { cleanEventInput, cleanSlug } from "@/lib/events/event-input";
import { eventScope } from "@/lib/organizer-auth/require-permission";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/events — Create a new event (organizer must be logged in)
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("events.create");
  if (result instanceof NextResponse) return result;
  const limited = await hostWriteLimit(result.id);
  if (limited) return limited;
  const session = result;

  try {
    const cleaned = cleanEventInput(await request.json().catch(() => null));
    if (!cleaned.ok) return NextResponse.json({ success: false, field: cleaned.field, error: cleaned.error }, { status: 400 });
    const data = cleaned.data;
    // Only a meeting this workspace just created can be attached (see lib/integrations/meeting-proof.ts).
    if (!meetingProofValid(session.organizerId, data.meetingProvider, data.meetingExternalId, data.meetingProof)) {
      data.meetingProvider = null;
      data.meetingExternalId = null;
    }
    const {
      title, slug, subtitle, category, format, startAt, endAt,
      venueName, address, venueMapUrl, meetingLink, description,
      capacity, coverImageUrl,
    } = data;

    if (descriptionTooLong(description)) {
      return NextResponse.json({ success: false, field: "description", error: DESCRIPTION_TOO_LONG }, { status: 400 });
    }
    // "Hosted by <startup>": only a verified startup, tagged by one of its own people.
    const startupId = typeof data.startupId === 'string' && data.startupId ? data.startupId : null;
    if (startupId) {
      const host = await prisma.eventOrganizer.findUnique({ where: { id: session.organizerId }, select: { email: true } });
      if (!(await canTagStartup([session.email, host?.email ?? ''], startupId))) {
        return NextResponse.json({ success: false, code: "startup_not_allowed", error: "You can only tag a verified startup you belong to." }, { status: 403 });
      }
    }
    // New independent organizers' first events wait for review; verified organizers and startups publish at once.
    const decision = await publishDecision(session.organizerId, { taggedStartup: !!startupId });
    const published = decision === "PUBLISHED";

    if (!title || !startAt || !endAt) {
      return NextResponse.json({ success: false, error: "Title, start date, and end date are required." }, { status: 400 });
    }
    // Paid tickets need an activated payout account (same rule as editing).
    if (hasPaidTickets(data.ticketTiers) && !(await canSellTickets(session.organizerId))) {
      return NextResponse.json({ success: false, code: "payouts_required", error: "Set up payouts in Settings → Payments before selling paid tickets." }, { status: 400 });
    }
    // Agenda sessions are checked before anything is saved.
    const agendaPlan = planAgenda(data.agenda, data.speakers, { startAt: new Date(startAt), endAt: new Date(endAt), timezone: cleanTimeZone(data.timezone) });
    if ("error" in agendaPlan) return NextResponse.json({ success: false, field: "agenda", error: agendaPlan.error }, { status: 400 });

    // New events publish immediately, so the plan's upcoming-events limit applies here.
    if (new Date(endAt) > new Date()) {
      const limit = await upcomingLimitProblem(session.organizerId);
      if (limit) return NextResponse.json({ success: false, code: "plan_limit", error: limit }, { status: 403 });
    }

    // Validate reserved slugs
    let finalSlug = slug || cleanSlug(title) || "event";
    if (isSlugReserved(finalSlug)) {
      finalSlug = `${finalSlug}-event`;
    }

    // Check slug uniqueness — append -2, -3 etc (no random strings)
    let slugCandidate = finalSlug;
    let attempt = 1;
    while (true) {
      const existing = await prisma.event.findUnique({ where: { slug: slugCandidate }, select: { id: true } });
      // Also check slug history (prevent reusing old slugs)
      const historyHit = await prisma.eventSlugHistory.findUnique({ where: { oldSlug: slugCandidate } });
      if (!existing && !historyHit) break;
      attempt++;
      slugCandidate = `${finalSlug}-${attempt}`;
      if (attempt > 20) { slugCandidate = `${finalSlug}-${Date.now().toString(36).slice(-4)}`; break; }
    }

    // Generate immutable short code (crypto-secure, 6 chars)
    let shortCode = generateShortCode(6);
    let codeAttempt = 0;
    while (codeAttempt < 5) {
      const codeExists = await prisma.event.findUnique({ where: { shortCode }, select: { id: true } });
      if (!codeExists) break;
      shortCode = generateShortCode(6);
      codeAttempt++;
    }

    // Description must be stored as JSON (schema is Json? type)
    // Store as a JSON object with text content
    const descriptionJson = description ? (description as any) : undefined;

    // The event and everything entered with it (speakers, tickets, questions, agenda) are saved together.
    const featuredUntil = published ? await featuredUntilFor(session.organizerId, new Date(endAt)) : null;
    const event = await prisma.$transaction(async (tx) => {
     const created = await tx.event.create({
      data: {
        organizerId: session.organizerId,
        title,
        slug: slugCandidate,
        shortCode,
        subtitle: subtitle || null,
        category: category || "CONFERENCE",
        format: format || "IN_PERSON",
        status: decision,
        startupId,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        featuredUntil,
        timezone: cleanTimeZone(data.timezone),
        venueName: venueName || null,
        venueMapUrl: venueMapUrl || null,
        address: address || null,
        meetingLink: format === "VIRTUAL" || format === "HYBRID" ? (meetingLink || null) : null,
        // A meeting made with a connected Zoom/Google account, so later time changes move it too.
        ...((format === "VIRTUAL" || format === "HYBRID") && meetingLink && isProvider(data.meetingProvider) && typeof data.meetingExternalId === "string"
          ? { meetingProvider: data.meetingProvider, meetingExternalId: data.meetingExternalId.slice(0, 200) } : {}),
        description: description ? { html: sanitizeUserHtml(String(description)), text: htmlToPlainText(String(description)) } : undefined,
        capacity: capacity ? parseInt(capacity) : null,
        coverImageUrl: coverImageUrl || null,
        visibility: "PUBLIC",
        publishedAt: published ? new Date() : null,
        reviewNote: published ? null : "First event from a new organizer",
        approvalRequired: data.approvalRequired === true,
        metaTitle: typeof data.seoTitle === "string" && data.seoTitle.trim() ? data.seoTitle.trim().slice(0, 120) : null,
        metaDescription: typeof data.seoDescription === "string" && data.seoDescription.trim() ? data.seoDescription.trim().slice(0, 300) : null,
      },
     });
     await createEventParts(tx, created.id, data, agendaPlan.sessions);
     return created;
    }, { timeout: 20_000 });

    if (published) {
      await applyFirstEventBoost(session.organizerId, event.id).catch((e) => console.error('[free boost]', e));
      refreshSections(['events', 'home']);
    }
    await logOrganizerActivity(session.organizerId, published ? 'event_published' : 'event_created', { actor: organizerActor(session), request, metadata: { title: String(title ?? '') } });
    return NextResponse.json({
      success: true,
      data: { id: event.id, slug: event.slug, shortCode: event.shortCode, status: decision },
      ...(published ? {} : { message: "Your event is saved and waiting for a quick review by our team (usually within a day). We'll email you when it's live." }),
    });
  } catch (error: any) {
    console.error("Organizer create event error:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Event with this slug already exists." }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Failed to create event." }, { status: 500 });
  }
}

/**
 * GET /api/organizer/events — List organizer's own events
 */
export async function GET() {
  const result = await requirePermission("events.view");
  if (result instanceof NextResponse) return result;
  const session = result;

  try {
    // Same rule as every other route: owners and admins see all events, limited teammates only theirs.
    const eventWhere = { ...eventScope(session), deletedAt: null };

    const events = await prisma.event.findMany({
      where: eventWhere,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        category: true,
        format: true,
        startAt: true,
        registrationCount: true,
        capacity: true,
      },
    });

    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Failed to fetch events." }, { status: 500 });
  }
}

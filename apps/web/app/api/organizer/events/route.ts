import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { featuredUntilFor, upcomingLimitProblem } from "@/lib/events/billing";
import { generateShortCode, isSlugReserved } from "@/lib/events/short-code";
import { sanitizeUserHtml, htmlToPlainText } from "@/lib/sanitize";
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { applyFirstEventBoost } from "@/lib/events/free-boost";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/events — Create a new event (organizer must be logged in)
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("events.create");
  if (result instanceof NextResponse) return result;
  const session = result;

  try {
    const data = await request.json();
    const {
      title, slug, subtitle, category, format, startAt, endAt,
      venueName, address, venueMapUrl, meetingLink, description,
      capacity, coverImageUrl,
    } = data;

    if (!title || !startAt || !endAt) {
      return NextResponse.json({ success: false, error: "Title, start date, and end date are required." }, { status: 400 });
    }
    // New events publish immediately, so the plan's upcoming-events limit applies here.
    if (new Date(endAt) > new Date()) {
      const limit = await upcomingLimitProblem(session.organizerId);
      if (limit) return NextResponse.json({ success: false, code: "plan_limit", error: limit }, { status: 403 });
    }

    // Validate reserved slugs
    let finalSlug = slug || title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").slice(0, 80);
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

    const event = await prisma.event.create({
      data: {
        organizerId: session.organizerId,
        title,
        slug: slugCandidate,
        shortCode,
        subtitle: subtitle || null,
        category: category || "CONFERENCE",
        format: format || "IN_PERSON",
        status: "PUBLISHED",
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        featuredUntil: await featuredUntilFor(session.organizerId, new Date(endAt)),
        timezone: "Asia/Kolkata",
        venueName: venueName || null,
        address: address || null,
        // Store venue map URL in the address field with a separator, or we use meetingLink field creatively
        // Actually let's store the map URL in the existing latitude/longitude or address
        meetingLink: format === "VIRTUAL" || format === "HYBRID" ? (meetingLink || null) : null,
        description: description ? { html: sanitizeUserHtml(String(description)), text: htmlToPlainText(String(description)) } : undefined,
        capacity: capacity ? parseInt(capacity) : null,
        coverImageUrl: coverImageUrl || null,
        visibility: "PUBLIC",
        publishedAt: new Date(),
        // Store venue map URL - we'll put it in the address field combined
        // Actually better: store map link as part of the venue info
      },
    });

    // If venueMapUrl is provided, update the event with lat/lng extracted later
    // For now store it in the address field alongside the address
    if (venueMapUrl && event.id) {
      const fullAddress = address
        ? `${address}`
        : null;
      // We can store the google maps URL — users can click it from event detail page
      // The address field already serves this purpose
      await prisma.event.update({
        where: { id: event.id },
        data: {
          address: venueMapUrl ? `${address || ""}|||${venueMapUrl}` : (address || null),
        },
      });
    }

    await applyFirstEventBoost(session.organizerId, event.id).catch((e) => console.error('[free boost]', e));
    refreshSections(['events', 'home']);
    return NextResponse.json({ success: true, data: { id: event.id, slug: event.slug, shortCode: event.shortCode } });
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
    const eventWhere: any = { organizerId: session.organizerId, deletedAt: null };
    if (session.assignedEventIds) {
      eventWhere.id = { in: session.assignedEventIds };
    }

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

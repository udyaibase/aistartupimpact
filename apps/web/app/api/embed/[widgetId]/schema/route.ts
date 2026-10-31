import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { eventSearchRateLimit } from "@/lib/event-rate-limit";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> }
) {
  const { widgetId } = await params;

  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(eventSearchRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ events: [] }, { status: 429, headers: CORS_HEADERS });
  }

  const widget = await prisma.embedWidget.findUnique({
    where: { id: widgetId, active: true },
  });

  if (!widget) {
    return NextResponse.json(
      { active: false, allowedDomains: [], events: [] },
      { headers: { ...CORS_HEADERS, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  }

  const where: any = {
    organizerId: widget.organizerId,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    deletedAt: null,
    startAt: { gte: new Date() },
  };

  if (widget.eventIds.length > 0) {
    where.id = { in: widget.eventIds };
  } else if (widget.categories.length > 0) {
    where.category = { in: widget.categories };
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: widget.maxEvents,
    select: {
      id: true,
      title: true,
      slug: true,
      startAt: true,
      endAt: true,
      timezone: true,
      venueName: true,
      address: true,
      format: true,
      coverImageUrl: true,
      organizer: { select: { name: true, company: true } },
    },
  });

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";

  const schemaEvents = events.map((event) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startAt.toISOString(),
    endDate: event.endAt.toISOString(),
    url: `${SITE_URL}/events/${event.slug}`,
    image: event.coverImageUrl || undefined,
    eventAttendanceMode:
      event.format === "VIRTUAL"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : event.format === "HYBRID"
          ? "https://schema.org/MixedEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
    location:
      event.format === "VIRTUAL"
        ? { "@type": "VirtualLocation", url: `${SITE_URL}/events/${event.slug}` }
        : event.venueName
          ? { "@type": "Place", name: event.venueName, address: event.address?.split("|||")[0] || undefined }
          : undefined,
    organizer: {
      "@type": "Organization",
      name: event.organizer.company || event.organizer.name,
    },
  }));

  return NextResponse.json(
    { active: true, allowedDomains: widget.allowedDomains, events: schemaEvents },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}

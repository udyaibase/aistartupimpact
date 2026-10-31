import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { eventSearchRateLimit, embedEventsRateLimit } from "@/lib/event-rate-limit";

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
  const [ipCheck, widgetCheck] = await Promise.all([
    checkRateLimit(eventSearchRateLimit, identifier),
    checkRateLimit(embedEventsRateLimit, widgetId),
  ]);
  if (!ipCheck.success || !widgetCheck.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  const widget = await prisma.embedWidget.findUnique({
    where: { id: widgetId },
    include: {
      organizer: {
        select: { id: true, name: true, company: true, avatar: true },
      },
    },
  });

  if (!widget) {
    return NextResponse.json(
      { widget: null, events: [] },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  if (!widget.active) {
    return NextResponse.json(
      { widget: { id: widget.id, active: false }, events: [] },
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
      shortCode: true,
      subtitle: true,
      category: true,
      format: true,
      startAt: true,
      endAt: true,
      timezone: true,
      venueName: true,
      address: true,
      coverImageUrl: true,
      capacity: true,
      registrationCount: true,
      registrationDeadline: true,
      approvalRequired: true,
      customQuestions: {
        select: {
          id: true,
          questionText: true,
          questionType: true,
          options: true,
          required: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      ticketTiers: {
        select: {
          id: true,
          name: true,
          tierType: true,
          priceCents: true,
          quantity: true,
          soldCount: true,
          saleStart: true,
          saleEnd: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      widget: {
        id: widget.id,
        name: widget.name,
        layout: widget.layout,
        accentColor: widget.accentColor,
        darkMode: widget.darkMode,
        showPoweredBy: widget.showPoweredBy,
        active: widget.active,
        organizer: widget.organizer,
      },
      events,
    },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}

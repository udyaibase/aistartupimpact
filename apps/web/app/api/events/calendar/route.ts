import { eventCity } from '@/lib/events/public-place';
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateICSContent } from "@/lib/events/calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/events/calendar?slug=event-slug
 * Returns a downloadable .ics file for the event.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const rows: any[] = await sql`
      SELECT 
        title, slug, subtitle, to_char("startAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startAt", to_char("endAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endAt",
        timezone, "venueName", address, format
      FROM "Event"
      WHERE slug = ${slug}
        AND status = 'PUBLISHED'
        AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = rows[0];
    const SITE_URL =
      process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";

    // Anyone can download this file, so it carries the venue and city. The street address goes to people who register.
    const city = eventCity(event.address);
    const location = event.venueName
      ? `${event.venueName}${city ? `, ${city}` : ""}`
      : event.format === "VIRTUAL"
      ? "Virtual Event"
      : undefined;

    const icsContent = generateICSContent({
      title: event.title,
      description: event.subtitle || `AI Event: ${event.title}`,
      startAt: event.startAt,
      endAt: event.endAt,
      timezone: event.timezone,
      location,
      url: `${SITE_URL}/events/${event.slug}`,
    });

    return new NextResponse(icsContent, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Calendar ICS generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate calendar file" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { apiRateLimit } from "@/lib/rate-limit";
import { getUserSession } from "@/lib/user-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(apiRateLimit, identifier);
  if (!success) {
    return NextResponse.json(
      { success: false, error: "Too many requests." },
      { status: 429 }
    );
  }

  const session = await getUserSession();
  if (!session?.email) {
    return NextResponse.json(
      { success: false, error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const rows = await sql`
      SELECT
        r.id,
        r.status,
        r."qrToken",
        r."registeredAt"::text AS "registeredAt",
        r."checkedInAt"::text AS "checkedInAt",
        e.title AS "eventTitle",
        e.slug AS "eventSlug",
        e.category AS "eventCategory",
        e.format AS "eventFormat",
        to_char(e."startAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "eventStartAt",
        to_char(e."endAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "eventEndAt",
        e.timezone AS "eventTimezone",
        e."venueName" AS "eventVenueName",
        e."coverImageUrl" AS "eventCoverImageUrl"
      FROM "EventRegistration" r
      JOIN "Event" e ON e.id = r."eventId"
      WHERE r."guestEmail" = ${session.email}
        AND r."deletedAt" IS NULL
        AND e."deletedAt" IS NULL
        AND e.status = 'PUBLISHED'
      ORDER BY e."startAt" DESC
    `;

    return NextResponse.json({ success: true, registrations: rows });
  } catch (error) {
    console.error("My events API error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: "Failed to fetch registrations." },
      { status: 500 }
    );
  }
}

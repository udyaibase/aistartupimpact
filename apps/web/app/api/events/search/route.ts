import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { eventSearchRateLimit } from "@/lib/event-rate-limit";
import { searchEvents, EVENT_SEARCH_KEYS, type EventSearchParams } from "@/lib/events/search";

export const dynamic = "force-dynamic";

/** Filtered results for the /events list (the page itself is cached without filters). */
export async function GET(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(eventSearchRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const params: EventSearchParams = {};
  for (const key of EVENT_SEARCH_KEYS) params[key] = request.nextUrl.searchParams.get(key);

  try {
    const events = await searchEvents(params);
    return NextResponse.json({ events }, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Event search API error:", error);
    return NextResponse.json({ events: [] }, { status: 500 });
  }
}

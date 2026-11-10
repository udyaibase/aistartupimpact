import { sql } from '@/lib/db';
import type { EVENT_SEARCH_KEYS } from './search-keys';

export { EVENT_SEARCH_KEYS } from './search-keys';

export type EventSearchParams = Partial<Record<(typeof EVENT_SEARCH_KEYS)[number], string | null>>;

/** Public events for the /events list (and its search API), at most 100. */
export async function searchEvents(params: EventSearchParams) {
  const now = new Date().toISOString();
  const filterCategory = params.category && params.category !== 'all' ? params.category : null;
  const filterFormat = params.format && params.format !== 'all' ? params.format : null;
  const timeframe = params.timeframe || 'upcoming';
  const searchQuery = params.q?.trim() ? `%${params.q.trim().slice(0, 120)}%` : null;
  const locationQuery = params.location?.trim() ? `%${params.location.trim().slice(0, 120)}%` : null;
  const sortBy = params.sort || 'soonest';

  return sql`
    SELECT
      e.id, e.title, e.slug, e.subtitle, e.category, e.format,
      e."startAt"::text AS "startAt", e."endAt"::text AS "endAt",
      e."venueName", e.address, e.latitude, e.longitude,
      e."coverImageUrl", e."registrationCount", e.capacity,
      e.timezone, e."sourceUrl", e."sourceName",
      o.name AS "organizerName", o.avatar AS "organizerAvatar",
      st.name AS "hostStartupName", st.slug AS "hostStartupSlug",
      (st.id IS NOT NULL OR o."verifiedAt" IS NOT NULL) AS "trustedHost",
      (e."featuredUntil" IS NOT NULL AND e."featuredUntil" > NOW() AND e."endAt" > NOW()) AS featured
    FROM "Event" e
    LEFT JOIN "EventOrganizer" o ON o.id = e."organizerId"
    -- "Hosted by" shows only while the tagged startup is verified.
    LEFT JOIN "Startup" st ON st.id = e."startupId" AND st."isVerified" = true AND st."deletedAt" IS NULL
    WHERE e.status = 'PUBLISHED'
      AND e."deletedAt" IS NULL
      AND e.visibility = 'PUBLIC'
      ${filterCategory ? sql`AND e.category = ${filterCategory}::"EventCategory"` : sql``}
      ${filterFormat ? sql`AND e.format = ${filterFormat}::"EventFormat"` : sql``}
      ${timeframe === "upcoming" ? sql`AND e."startAt" >= ${now}::timestamp` : sql``}
      ${timeframe === "past" ? sql`AND e."endAt" < ${now}::timestamp` : sql``}
      ${timeframe === "this_week" ? sql`AND e."startAt" >= ${now}::timestamp AND e."startAt" < (${now}::timestamp + interval '7 days')` : sql``}
      ${timeframe === "today" ? sql`AND DATE(e."startAt") = DATE(${now}::timestamp)` : sql``}
      ${searchQuery ? sql`AND (e.title ILIKE ${searchQuery} OR e.subtitle ILIKE ${searchQuery} OR e."venueName" ILIKE ${searchQuery} OR o.name ILIKE ${searchQuery})` : sql``}
      ${locationQuery ? sql`AND (e.address ILIKE ${locationQuery} OR e."venueName" ILIKE ${locationQuery} OR (${locationQuery} ILIKE '%online%' AND e.format = 'VIRTUAL') OR (${locationQuery} ILIKE '%virtual%' AND e.format = 'VIRTUAL'))` : sql``}
    ORDER BY
      ${timeframe === 'past'
        ? sql`e."startAt" DESC`
        : sortBy === 'popular'
          ? sql`(e."featuredUntil" > NOW() AND e."endAt" > NOW()) DESC NULLS LAST, e."registrationCount" DESC NULLS LAST`
          : sortBy === 'newest'
            ? sql`e.id DESC`
            // Featured first, then events from verified startups and verified organizers, then the rest.
            : sql`CASE WHEN e."featuredUntil" > NOW() AND e."endAt" > NOW() THEN 0 ELSE 1 END ASC, CASE WHEN st.id IS NOT NULL OR o."verifiedAt" IS NOT NULL THEN 0 ELSE 1 END ASC, CASE WHEN e."startAt" >= ${now}::timestamp THEN 0 ELSE 1 END ASC, e."startAt" ASC`
      }
    LIMIT 100
  `;
}

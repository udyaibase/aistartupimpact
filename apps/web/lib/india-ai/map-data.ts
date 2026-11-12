import { cache } from 'react';
import { sql } from '@/lib/db';
import { cached } from '@/lib/cache';
import { hqInIndia } from '@/lib/india-hq';
import { loadFundingRounds } from '@/lib/funding/rounds';
import { buildFallback } from '@/lib/build-fallback';
import { inrPaiseOf, inScope } from '@/lib/funding/insights';
import type { Activity, MapData } from '@/components/india-ai/map-model';
import { roundLabel } from '@/lib/funding/format';
import { moneyLabel } from '@/lib/funding/insights';

export const MAP_DATA_KEY = 'india-ai:map:v2';

/**
 * Optional layers (jobs, events, the live ticker) fall back to empty when their query fails, so a problem in one
 * of those tables can't take the India AI pages (or a deploy that prerenders them) down. Logged loudly.
 */
function optional<T>(name: string, q: Promise<T[]>): Promise<T[]> {
  return q.catch((err) => {
    console.error(`[india-ai/map-data] ${name} query failed; showing the map without it`, err);
    return [] as T[];
  });
}

/**
 * Everything the India AI map needs, for the /india-ai page, the loading placeholder and the city rankings — one
 * loader, so every surface shows the same numbers. Cached for 5 minutes (Redis) and once per request (React).
 * Throws when the core data (cities, startups, funding) fails, so a broken map is never cached.
 */
const EMPTY_MAP: MapData = { cities: [], startups: [], jobsByCity: [], eventPlaces: [], rounds: [], activity: [] };

export const getMapData = cache((): Promise<MapData> => loadMapData().catch(buildFallback(EMPTY_MAP, 'India AI map data')));

async function loadMapData(): Promise<MapData> {
  return cached(MAP_DATA_KEY, { ttl: 300, staleTtl: 900 }, async () => {
    const [cities, startups, jobsByCity, eventRows, rounds, newStartups, newJobs] = await Promise.all([
      // Indian cities (with coordinates) that have at least one approved Indian startup.
      sql`
        SELECT c.id, c."cityName", c.slug, c.state, c.latitude::float AS latitude, c.longitude::float AS longitude,
               c."topSectors", c."totalFunding", c.aliases, COUNT(s.id)::int AS "totalStartups"
        FROM "IndiaAICity" c
        INNER JOIN "Startup" s ON (
          LOWER(s."headquartersCity") = LOWER(c."cityName")
          OR LOWER(s."headquartersCity") = ANY(SELECT LOWER(unnest(c.aliases)))
        )
        WHERE c."isActive" = true AND c.latitude != 0 AND c.longitude != 0
          AND c.latitude BETWEEN 6 AND 37.5 AND c.longitude BETWEEN 68 AND 97.5
          AND ${hqInIndia('s')} AND s."deletedAt" IS NULL AND s."isApproved" = true
        GROUP BY c.id, c."cityName", c.slug, c.state, c.latitude, c.longitude, c."topSectors", c."totalFunding", c.aliases
        HAVING COUNT(s.id) > 0
        ORDER BY COUNT(s.id) DESC
        LIMIT 60
      `,
      // Every approved Indian startup in a mapped city, so a dot's number and its list always agree.
      sql`
        SELECT id, name, slug, tagline, "logoUrl", "headquartersCity", stage, "totalFundingInr"::text AS "totalFundingInr",
               "foundedYear", COALESCE(NULLIF(TRIM(category), ''), 'Other') AS sector
        FROM "Startup"
        WHERE ${hqInIndia('"Startup"')} AND "deletedAt" IS NULL AND "isApproved" = true
          AND COALESCE("headquartersCity", '') <> ''
          AND EXISTS (
            SELECT 1 FROM "IndiaAICity" c
            WHERE c."isActive" = true AND c.latitude BETWEEN 6 AND 37.5 AND c.longitude BETWEEN 68 AND 97.5
              AND (LOWER("Startup"."headquartersCity") = LOWER(c."cityName")
                   OR LOWER("Startup"."headquartersCity") = ANY(SELECT LOWER(unnest(c.aliases))))
          )
        ORDER BY "totalFundingInr" DESC NULLS LAST
        LIMIT 3000
      `,
      // Open on-site/hybrid jobs per city (remote jobs have no place on a map).
      optional('jobs', sql`
        SELECT LOWER(TRIM(city)) AS city, COUNT(*)::int AS n
        FROM "JobBoardListing"
        WHERE status = 'OPEN' AND "moderationHold" = false AND "deletedAt" IS NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW()) AND "workType" <> 'REMOTE' AND COALESCE(city, '') <> ''
        GROUP BY 1
      `),
      // Upcoming in-person events; events have no city field, so the map matches a city name in this text.
      optional('events', sql`
        SELECT LOWER(CONCAT_WS(' ', "venueName", address)) AS place
        FROM "Event"
        WHERE status = 'PUBLISHED' AND visibility = 'PUBLIC' AND "deletedAt" IS NULL AND "endAt" > NOW() AND format <> 'VIRTUAL'
        LIMIT 500
      `),
      // Funding rounds of Indian startups, reduced to city + amount + year (for the Funding view and the time-lapse).
      loadFundingRounds(),
      // Recent activity for the live ticker: startups added, jobs published.
      optional('new startups', sql`
        SELECT name, slug, "headquartersCity" AS city, COALESCE("approvedAt", "createdAt")::text AS at
        FROM "Startup"
        WHERE ${hqInIndia('"Startup"')} AND "deletedAt" IS NULL AND "isApproved" = true
          AND COALESCE("approvedAt", "createdAt") > NOW() - INTERVAL '30 days'
        ORDER BY COALESCE("approvedAt", "createdAt") DESC LIMIT 12
      `),
      optional('new jobs', sql`
        SELECT jl.title, jl.slug, jl.city, e."companyName", jl."publishedAt"::text AS at
        FROM "JobBoardListing" jl JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
        WHERE jl.status = 'OPEN' AND jl."moderationHold" = false AND jl."deletedAt" IS NULL
          AND jl."publishedAt" > NOW() - INTERVAL '14 days' AND COALESCE(jl.city, '') <> '' AND jl."workType" <> 'REMOTE'
        ORDER BY jl."publishedAt" DESC LIMIT 12
      `),
    ]);
    const india = inScope(rounds, 'india');
    const recentRounds = india.filter((r) => r.city && Date.now() - new Date(r.announcedAt).getTime() <= 60 * 864e5).slice(0, 12);
    const activity: Activity[] = [
      ...(newStartups as { name: string; slug: string; city: string; at: string }[]).map((s) => ({
        kind: 'startup' as const, text: `${s.name.trim()} joined the map in ${s.city.split(',')[0].trim()}`, href: `/startups/${s.slug}`, city: s.city.trim().toLowerCase(), at: s.at,
      })),
      ...recentRounds.map((r) => ({
        kind: 'round' as const, text: `${r.startupName.trim()} raised ${moneyLabel(inrPaiseOf(r)).split(' (')[0]} (${roundLabel(r.roundType)}) in ${r.city}`,
        href: r.slug ? `/funding/${r.slug}` : `/startups/${r.startupSlug}`, city: r.city!.toLowerCase(), at: r.announcedAt,
      })),
      ...(newJobs as { title: string; slug: string; city: string; companyName: string; at: string }[]).map((j) => ({
        kind: 'job' as const, text: `${j.companyName.trim()} is hiring a ${j.title.trim()} in ${j.city.split(',')[0].trim()}`, href: `/jobs/${j.slug}`, city: j.city.trim().toLowerCase(), at: j.at,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 24);
    return {
      cities: cities as MapData['cities'],
      startups: startups as MapData['startups'],
      jobsByCity: jobsByCity as MapData['jobsByCity'],
      eventPlaces: (eventRows as { place: string | null }[]).map((r) => r.place || '').filter(Boolean),
      activity,
      rounds: india
        .filter((r) => r.city)
        .map((r) => ({ c: r.city!.toLowerCase(), p: inrPaiseOf(r), y: Number(r.announcedAt.slice(0, 4)) })),
    };
  });
}

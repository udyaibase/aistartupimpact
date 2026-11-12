import { cache } from 'react';
import { sql } from '@/lib/db';
import { cached } from '@/lib/cache';
import { INDIA_CITY_KEYS } from '@/lib/india-hq';
import { standardizeCityName } from '@udyaibase/utils/src/cities';
import type { FundingRoundRow } from '@/lib/funding/insights';

/** Redis key for the shared round list; cleared when admin changes funding or startups (webhooks/revalidate). */
export const FUNDING_ROUNDS_KEY = 'funding:rounds:v1';

const INDIA = new Set(INDIA_CITY_KEYS);
const cityKey = (c: string | null) => (c ? c.split(',')[0].split('(')[0].trim().toLowerCase() : '');

/**
 * Every funding round of a live startup, newest first, each flagged "headquartered in India" (standard city
 * list) with a standardised city. One list feeds the tracker, monthly reports, city hubs and investor pages:
 * one query per request (React cache) and per 5 minutes across requests (Redis). Admin edits refresh the pages.
 * Throws on a database error, so a failure is never cached as an empty list.
 */
export const getFundingRounds = cache(async (): Promise<FundingRoundRow[]> => {
  const rows = await cached(FUNDING_ROUNDS_KEY, { ttl: 300, staleTtl: 900 }, async () => {
    return (await sql`
      SELECT
        fr.id, to_jsonb(fr) ->> 'slug' AS slug, fr."roundType", fr."amountInr"::text AS "amountInr", fr."amountUsd"::text AS "amountUsd",
        fr."announcedAt"::text AS "announcedAt", fr."leadInvestors", fr."allInvestors",
        s.name AS "startupName", s.slug AS "startupSlug", s."headquartersCity",
        s.category AS "startupCategory", s."logoUrl" AS "startupLogoUrl"
      FROM "FundingRound" fr
      JOIN "Startup" s ON s.id = fr."startupId"
      WHERE s."deletedAt" IS NULL
      ORDER BY fr."announcedAt" DESC
    `) as Omit<FundingRoundRow, 'inIndia' | 'city'>[];
  });
  return rows.map((r) => ({
    ...r,
    inIndia: INDIA.has(cityKey(r.headquartersCity)),
    city: r.headquartersCity ? standardizeCityName(r.headquartersCity.split(',')[0].trim()) : null,
  }));
});

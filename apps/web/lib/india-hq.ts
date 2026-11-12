import { CITY_DATABASE } from '@udyaibase/utils/src/cities';
import { sql } from '@/lib/db';

/**
 * "Headquartered in India", for SQL. The Startup."isIndian" flag can't be used: every insert sets it to true, so
 * startups based in San Francisco or Austin counted as Indian on the India AI page (funding tracker, stats, map).
 *
 * A startup's headquarters comes from the standard city list (packages/utils CITY_DATABASE), which records each
 * city's real country. These are the Indian names and spellings, lower-cased.
 */
export const INDIA_CITY_KEYS: string[] = Array.from(
  new Set(
    CITY_DATABASE.filter((c) => c.country === 'India').flatMap((c) =>
      [c.city, ...(c.aliases ?? [])].map((n) => n.trim().toLowerCase()).filter(Boolean),
    ),
  ),
);

/** Table names or aliases the helper accepts. Column names can't be bound parameters, so this list is fixed. */
type StartupRef = 's' | 'st' | '"Startup"';

/** The headquarters city as compared: lower-cased, before any comma or bracket ("Bengaluru, Karnataka" → "bengaluru"). */
const cityKey = (table: StartupRef) =>
  `LOWER(TRIM(split_part(split_part(COALESCE(${table}."headquartersCity", ''), ',', 1), '(', 1)))`;

/** SQL condition: the startup is headquartered in India. Use in a WHERE clause, e.g. sql`... AND ${hqInIndia('s')}`. */
export function hqInIndia(table: StartupRef) {
  return sql`${sql.unsafe(cityKey(table))} = ANY(${INDIA_CITY_KEYS})`;
}

/** SQL condition: the startup has a headquarters city, and it is outside India. */
export function hqOutsideIndia(table: StartupRef) {
  return sql`COALESCE(${sql.unsafe(`${table}."headquartersCity"`)}, '') <> '' AND NOT (${sql.unsafe(cityKey(table))} = ANY(${INDIA_CITY_KEYS}))`;
}

/** India AI city pages with fewer startups than this are thin: still viewable, but noindex and left out of the sitemap. */
export const MIN_CITY_STARTUPS = 3;

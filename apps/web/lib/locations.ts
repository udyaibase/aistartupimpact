import { sql } from '@/lib/db';
import { cityList, matchCity, normalizeCountry, splitLegacyLocation, type PlaceCity } from '@udyaibase/utils/src/locations';
import type { CityEntry } from '@udyaibase/utils/src/cities';

/**
 * Server side of the standard city/country lists: the shared city list plus cities admins add on the Cities page.
 * Forms use the same lists through the pickers; these checks make the API accept only what the pickers offer.
 */

let cache: { at: number; extra: Partial<CityEntry>[] } | null = null;

/** Admin-added cities (all in India), cached for 5 minutes per server instance. */
export async function getExtraCities(): Promise<Partial<CityEntry>[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.extra;
  try {
    const rows = (await sql`SELECT "cityName", state, slug, latitude::float AS lat, longitude::float AS lng FROM "IndiaAICity"`) as { cityName: string; state: string | null; slug: string; lat: number | null; lng: number | null }[];
    // The Cities page has no country column; cityList works it out from the name, state and coordinates.
    const extra = rows.map((r) => ({ city: r.cityName, state: r.state ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined, aliases: [r.slug] }));
    cache = { at: Date.now(), extra };
    return extra;
  } catch (err) {
    console.error('[locations] extra cities', err instanceof Error ? err.message : err);
    return cache?.extra ?? [];
  }
}

export async function standardCities(): Promise<PlaceCity[]> {
  return cityList(await getExtraCities());
}

type Checked = { ok: true; city: string | null; state: string | null; country: string | null } | { ok: false; error: string; field: 'city' | 'country' };

/**
 * Validate a submitted city/country pair. The country must be a standard country; the city (when given or required)
 * must be a listed city in that country. Returns the standard spellings to save.
 */
export async function checkLocation(input: { city?: unknown; country?: unknown }, opts: { cityRequired?: boolean; countryRequired?: boolean } = {}): Promise<Checked> {
  const { city: rawCity, country: rawCountry } = splitLegacyLocation(
    typeof input.city === 'string' ? input.city : '', typeof input.country === 'string' ? input.country.trim() : '');
  const country = rawCountry ? normalizeCountry(rawCountry) : null;
  if (rawCountry && !country) return { ok: false, error: 'Choose a country from the list.', field: 'country' };
  if (!country && opts.countryRequired) return { ok: false, error: 'Choose a country.', field: 'country' };
  if (!rawCity) return opts.cityRequired ? { ok: false, error: 'Choose a city.', field: 'city' } : { ok: true, city: null, state: null, country };
  const hit = matchCity(await standardCities(), rawCity, country);
  if (!hit) return { ok: false, error: country ? `Choose a city in ${country} from the list.` : 'Choose a city from the list.', field: 'city' };
  return { ok: true, city: hit.city, state: hit.state, country: country ?? hit.country };
}

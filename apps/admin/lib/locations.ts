import { prisma } from '@udyaibase/database';
import { cityList, matchCity, normalizeCountry, splitLegacyLocation, type PlaceCity } from '@udyaibase/utils/src/locations';
import type { CityEntry } from '@udyaibase/utils/src/cities';

/**
 * Admin side of the standard city/country lists (same lists as the website): the shared city list plus the cities
 * on the Cities page. Admin forms use the pickers; actions accept only what the pickers offer.
 */

export async function getExtraCities(): Promise<Partial<CityEntry>[]> {
  const rows = await prisma.indiaAICity.findMany({ select: { cityName: true, state: true, slug: true, latitude: true, longitude: true } });
  // The Cities page has no country column; cityList works it out from the name, state and coordinates.
  return rows.map((r) => ({ city: r.cityName, state: r.state ?? undefined, lat: Number(r.latitude), lng: Number(r.longitude), aliases: [r.slug] }));
}

export async function standardCities(): Promise<PlaceCity[]> {
  return cityList(await getExtraCities());
}

type Checked = { ok: true; city: string | null; state: string | null; country: string | null } | { ok: false; error: string; field: 'city' | 'country' };

export async function checkLocation(input: { city?: unknown; country?: unknown }, opts: { cityRequired?: boolean; countryRequired?: boolean } = {}): Promise<Checked> {
  const { city: rawCity, country: rawCountry } = splitLegacyLocation(
    typeof input.city === 'string' ? input.city : '', typeof input.country === 'string' ? input.country.trim() : '');
  const country = rawCountry ? normalizeCountry(rawCountry) : null;
  if (rawCountry && !country) return { ok: false, error: 'Choose a country from the list.', field: 'country' };
  if (!country && opts.countryRequired) return { ok: false, error: 'Choose a country.', field: 'country' };
  if (!rawCity) return opts.cityRequired ? { ok: false, error: 'Choose a city.', field: 'city' } : { ok: true, city: null, state: null, country };
  const hit = matchCity(await standardCities(), rawCity, country);
  if (!hit) return { ok: false, error: country ? `Choose a city in ${country} from the list (add missing cities on the Cities page).` : 'Choose a city from the list (add missing cities on the Cities page).', field: 'city' };
  return { ok: true, city: hit.city, state: hit.state, country: country ?? hit.country };
}

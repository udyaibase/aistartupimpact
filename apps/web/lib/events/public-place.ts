import { CITY_DATABASE } from '@udyaibase/utils/src/cities';

/**
 * What a visitor may know about where an in-person event is before they register: the city. The street address and
 * map position are for people who have registered (their confirmation, ticket and "My events").
 *
 * The event page has always said "Register to See Address", but the events list, the public search and the calendar
 * download gave the address to anyone.
 */

const KNOWN = new Map<string, string>();
for (const c of CITY_DATABASE) {
  KNOWN.set(c.city.toLowerCase(), c.city);
  for (const alias of c.aliases ?? []) KNOWN.set(alias.toLowerCase(), c.city);
}
const NOT_A_CITY = /^(india|bharat|\d{5,6})$/i;

/** The city in an address like "Hosur Road, Bengaluru, Karnataka 560029": a known city if any part is one. */
export function eventCity(address: string | null | undefined): string {
  const parts = String(address ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .split(/[,|\n]/)
    .map((part) => part.replace(/\b\d{5,6}\b/g, '').trim())
    .filter((part) => part.length > 1 && !NOT_A_CITY.test(part));
  for (let i = parts.length - 1; i >= 0; i--) {
    const known = KNOWN.get(parts[i].toLowerCase());
    if (known) return known;
  }
  // No known city: an address of one part may be a street, so say nothing rather than leak it.
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** A row from a public query, with the street address and map position replaced by the city. */
export function withoutAddress<T extends Record<string, unknown>>(row: T): Omit<T, 'address' | 'latitude' | 'longitude'> & { city: string } {
  const { address, latitude: _lat, longitude: _lng, ...rest } = row as T & { address?: string | null; latitude?: unknown; longitude?: unknown };
  return { ...rest, city: eventCity(address) };
}

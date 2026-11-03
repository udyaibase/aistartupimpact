import { checkLocation } from '@/lib/locations';
import { jobLocationLabel } from '@/lib/jobs/composer';

/**
 * A job's city and country in their standard spellings (from the city/country lists), with the display label
 * rebuilt to match. Older free-text values that clearly name a listed city ("Bengaluru, KA, India") are cleaned up;
 * anything else is refused with the field to fix, so only listed places are saved.
 */
export async function standardJobLocation<T extends { workType: string; city: string | null; country: string | null }>(data: T):
  Promise<{ ok: true; data: T & { location: string | null } } | { ok: false; error: string; field: 'city' | 'country' }> {
  const loc = await checkLocation({ city: data.city ?? '', country: data.country ?? '' });
  if (!loc.ok) return loc;
  return { ok: true, data: { ...data, city: loc.city, country: loc.country, location: jobLocationLabel(data.workType, loc.city, loc.country) } };
}

/**
 * Event times are entered as wall-clock time in the event's time zone (10:00 in Bengaluru), whatever time zone the
 * organizer's computer is in. These convert between that and the UTC instant we store, without a date library.
 */

export const DEFAULT_EVENT_TIMEZONE = 'Asia/Kolkata';

/** A real IANA time zone, with the old "Asia/Calcutta" name mapped to "Asia/Kolkata"; otherwise IST. */
export function cleanTimeZone(tz: unknown): string {
  const name = typeof tz === 'string' ? tz.trim() : '';
  if (!name) return DEFAULT_EVENT_TIMEZONE;
  if (name === 'Asia/Calcutta') return DEFAULT_EVENT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return name;
  } catch {
    return DEFAULT_EVENT_TIMEZONE;
  }
}

/** Milliseconds the zone is ahead of UTC at that instant (IST: +5h30m). */
function offsetMs(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** "2026-11-20" + "10:00" in Asia/Kolkata → the UTC instant (2026-11-20T04:30:00Z). Null for incomplete input. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const tz = cleanTimeZone(timeZone);
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  let utc = wall - offsetMs(tz, wall);
  // Around a daylight-saving change the offset at the guess can differ from the offset at the result.
  const second = offsetMs(tz, utc);
  if (wall - second !== utc) utc = wall - second;
  return new Date(utc);
}

/** The UTC instant shown as date and time in the event's zone: { date: "2026-11-20", time: "10:00" }. */
export function utcToZoned(iso: string | Date | null | undefined, timeZone: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: cleanTimeZone(timeZone), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/**
 * A stored event time as a real instant. The database keeps UTC without a zone marker, and a query that returns it
 * as text ("2026-11-28 04:30:00") was read by browsers as local time, so a 10:00 AM event in India showed as 4:30 AM
 * to visitors in India. Text without a zone is UTC here, whatever the device's own zone.
 */
export function eventInstant(value: string | Date | null | undefined): Date {
  if (value instanceof Date) return value;
  const text = String(value ?? '').trim();
  const bare = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(text);
  return new Date(bare ? `${bare[1]}T${bare[2]}Z` : text);
}

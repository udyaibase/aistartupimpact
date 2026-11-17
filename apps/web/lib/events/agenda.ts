import { utcToZoned, zonedToUtc } from './zoned-time';
import { cleanHttpsUrl } from './urls';

/**
 * Multi-day, multi-track agenda. Sessions have a day number, start and end ("HH:MM" in the event's time zone),
 * an optional track (one of the event's tracks) and speaker, and after the event a recording and slides link.
 */

export const MAX_TRACKS = 8;
export const MAX_SESSIONS = 300;
export const MAX_DAYS = 14;

export type SessionInput = {
  id?: string; dayNumber: number; startTime: string; endTime: string; title: string; description: string | null;
  speakerId: string | null; track: string | null; recordingUrl: string | null; slidesUrl: string | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanTracks(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    if (typeof t !== 'string') continue;
    const name = t.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= MAX_TRACKS) break;
  }
  return out;
}

/** Validate sessions; returns the clean list or the first problem (with its row). */
export function cleanSessions(raw: unknown, ctx: { tracks: string[]; speakerIds: Set<string> }): { sessions: SessionInput[] } | { error: string; row: number } {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_SESSIONS) : [];
  const sessions: SessionInput[] = [];
  for (const [i, item] of list.entries()) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const title = String(r.title ?? '').trim().slice(0, 200);
    if (!title) return { error: 'Every session needs a title.', row: i };
    const startTime = String(r.startTime ?? '').trim();
    const endTime = String(r.endTime ?? '').trim();
    if (!TIME.test(startTime)) return { error: `“${title}” needs a start time.`, row: i };
    if (endTime && !TIME.test(endTime)) return { error: `“${title}” has an invalid end time.`, row: i };
    if (endTime && endTime <= startTime) return { error: `“${title}” ends before it starts.`, row: i };
    const day = Number(r.dayNumber ?? 1);
    const dayNumber = Number.isInteger(day) && day >= 1 && day <= MAX_DAYS ? day : 1;
    const track = typeof r.track === 'string' && ctx.tracks.includes(r.track) ? r.track : null;
    const speakerId = typeof r.speakerId === 'string' && ctx.speakerIds.has(r.speakerId) ? r.speakerId : null;
    sessions.push({
      id: typeof r.id === 'string' ? r.id : undefined,
      dayNumber, startTime, endTime, title,
      description: String(r.description ?? '').trim().slice(0, 1000) || null,
      speakerId, track,
      recordingUrl: cleanHttpsUrl(r.recordingUrl), slidesUrl: cleanHttpsUrl(r.slidesUrl),
    });
  }
  return { sessions };
}

/** Calendar date of a given day of the event, in its time zone (day 1 = the start date). */
export function eventDayDate(startAt: Date | string, timezone: string, dayNumber: number): string {
  const { date } = utcToZoned(startAt, timezone);
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + (dayNumber - 1)));
  return dt.toISOString().slice(0, 10);
}

/** A session's start and end as UTC instants (end defaults to 30 minutes after the start). */
export function sessionTimes(s: { dayNumber: number; startTime: string; endTime: string }, event: { startAt: Date | string; timezone: string }) {
  const date = eventDayDate(event.startAt, event.timezone, s.dayNumber);
  const start = zonedToUtc(date, s.startTime, event.timezone);
  const end = s.endTime ? zonedToUtc(date, s.endTime, event.timezone) : start ? new Date(start.getTime() + 30 * 60_000) : null;
  return { start, end };
}

/** Number of calendar days the event spans (at least 1). */
export function eventDayCount(startAt: Date | string, endAt: Date | string, timezone: string): number {
  const a = utcToZoned(startAt, timezone).date;
  const b = utcToZoned(endAt, timezone).date;
  if (!a || !b) return 1;
  const days = Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
  return Math.min(MAX_DAYS, Math.max(1, days));
}

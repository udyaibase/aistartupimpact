/**
 * Repeat rules for event series, as pure date maths (no database), so the organizer editor can preview exactly the
 * dates the daily job will create. Dates are calendar days as YYYY-MM-DD in the template event's own time zone.
 */

export type Recurrence = {
  freq: 'WEEKLY' | 'MONTHLY';
  /** Every n weeks (1–4) or months (1–3). */
  interval: number;
  /** MONTHLY only: which week of the month (1–4, or -1 for the last). The weekday comes from the template. */
  monthWeek: number | null;
  /** How many days before each date the draft is created. */
  createAheadDays: number;
  templateEventId: string;
  /** When the repeat stops: never, after N dates (counted from the template's date), or on a date (inclusive). */
  ends: 'never' | 'after' | 'on';
  endAfter: number | null;
  endOn: string | null;
  /** Paused: no drafts are made; dates that pass while paused are not created later. */
  paused: boolean;
  /** Single dates to leave out (a festival week, a venue clash). */
  skipDates: string[];
};

export const MAX_END_AFTER = 104;
const MAX_SKIPS = 50;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDay = (s: string) => new Date(`${s}T00:00:00Z`);
const fromDay = (d: Date) => d.toISOString().slice(0, 10);
export const isDay = (s: unknown): s is string => typeof s === 'string' && DAY_RE.test(s) && fromDay(toDay(s)) === s;
export const weekdayOf = (s: string) => toDay(s).getUTCDay();
export const addDays = (s: string, n: number) => fromDay(new Date(toDay(s).getTime() + n * 86_400_000));

/** Today's date in a time zone, as YYYY-MM-DD. */
export function todayIn(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return fromDay(now);
  }
}

export function cleanRecurrence(raw: unknown): Recurrence | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r || typeof r.templateEventId !== 'string' || !r.templateEventId) return null;
  const freq = r.freq === 'MONTHLY' ? 'MONTHLY' : r.freq === 'WEEKLY' ? 'WEEKLY' : null;
  if (!freq) return null;
  const maxInterval = freq === 'WEEKLY' ? 4 : 3;
  const interval = Math.min(maxInterval, Math.max(1, Math.round(Number(r.interval) || 1)));
  const mw = Math.round(Number(r.monthWeek));
  const monthWeek = freq === 'MONTHLY' ? (mw === -1 || (mw >= 1 && mw <= 4) ? mw : 1) : null;
  const createAheadDays = Math.min(60, Math.max(3, Math.round(Number(r.createAheadDays) || 21)));

  // Rules saved before ends/pause/skips existed simply never end.
  let ends: Recurrence['ends'] = r.ends === 'after' || r.ends === 'on' ? r.ends : 'never';
  const n = Math.round(Number(r.endAfter));
  const endAfter = ends === 'after' && n >= 1 ? Math.min(MAX_END_AFTER, n) : null;
  const endOn = ends === 'on' && isDay(r.endOn) ? r.endOn : null;
  if ((ends === 'after' && endAfter === null) || (ends === 'on' && endOn === null)) ends = 'never';

  const skipDates = Array.isArray(r.skipDates)
    ? Array.from(new Set(r.skipDates.filter(isDay))).sort().slice(-MAX_SKIPS)
    : [];
  return { freq, interval, monthWeek, createAheadDays, templateEventId: r.templateEventId, ends, endAfter, endOn, paused: r.paused === true, skipDates };
}

/** The parts of a rule that decide which dates exist; changing them restarts the schedule from today. */
export const scheduleKey = (r: Recurrence | null) => (r ? JSON.stringify([r.freq, r.interval, r.monthWeek, r.templateEventId]) : '');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function describeRecurrence(r: Pick<Recurrence, 'freq' | 'interval' | 'monthWeek'>, weekday: number): string {
  const day = DAYS[weekday];
  if (r.freq === 'WEEKLY') return r.interval === 1 ? `Every ${day}` : `Every ${r.interval} weeks on ${day}`;
  const nth = r.monthWeek === -1 ? 'last' : ['first', 'second', 'third', 'fourth'][(r.monthWeek ?? 1) - 1];
  return `The ${nth} ${day} of every ${r.interval === 1 ? 'month' : `${r.interval} months`}`;
}

/** The nth (or last) given weekday in a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n === -1) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return fromDay(new Date(Date.UTC(year, month + 1, -back)));
  }
  const first = new Date(Date.UTC(year, month, 1));
  const ahead = (weekday - first.getUTCDay() + 7) % 7;
  return fromDay(new Date(Date.UTC(year, month, 1 + ahead + (n - 1) * 7)));
}

/** Dates after `after` up to and including `until`, following the rule from the template's date (ends and skips ignored). */
export function occurrencesBetween(rule: Pick<Recurrence, 'freq' | 'interval' | 'monthWeek'>, templateDate: string, after: string, until: string, limit = 10): string[] {
  const out: string[] = [];
  const weekday = weekdayOf(templateDate);
  if (rule.freq === 'WEEKLY') {
    for (let d = templateDate, i = 0; d <= until && i < 400; d = addDays(d, 7 * rule.interval), i++) {
      if (d > after) { out.push(d); if (out.length >= limit) break; }
    }
    return out;
  }
  const t = toDay(templateDate);
  for (let k = 0; k < 120; k++) {
    const m = t.getUTCMonth() + k * rule.interval;
    const d = nthWeekday(t.getUTCFullYear() + Math.floor(m / 12), m % 12, weekday, rule.monthWeek ?? 1);
    if (d > until) break;
    if (d > after && d >= templateDate) { out.push(d); if (out.length >= limit) break; }
  }
  return out;
}

/** The last date the repeat may create, or null when it never ends. "After N" counts the dates after the template's. */
export function lastDateOf(rule: Recurrence, templateDate: string): string | null {
  if (rule.ends === 'on') return rule.endOn;
  if (rule.ends === 'after' && rule.endAfter) {
    const dates = occurrencesBetween(rule, templateDate, templateDate, addDays(templateDate, 366 * 10), rule.endAfter);
    return dates[dates.length - 1] ?? templateDate;
  }
  return null;
}

/** Dates in (after, until] that the repeat will actually create: within the end, minus skipped dates. Skipped dates are returned separately. */
export function plannedDates(rule: Recurrence, templateDate: string, after: string, until: string, limit = 10): { date: string; skipped: boolean }[] {
  const end = lastDateOf(rule, templateDate);
  const cap = end && end < until ? end : until;
  if (cap <= after) return [];
  const skip = new Set(rule.skipDates);
  return occurrencesBetween(rule, templateDate, after, cap, limit).map((date) => ({ date, skipped: skip.has(date) }));
}

/** Short text for the end setting, e.g. "Ends after 6 events (last on 4 Jun 2027)". */
export function describeEnd(rule: Recurrence, templateDate: string): string {
  if (rule.ends === 'never') return 'No end date';
  const last = lastDateOf(rule, templateDate);
  const nice = last ? toDay(last).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  if (rule.ends === 'after') return `Ends after ${rule.endAfter} ${rule.endAfter === 1 ? 'event' : 'events'}${nice ? ` (last on ${nice})` : ''}`;
  return `Ends on ${nice}`;
}

/**
 * Support reply-time promises. Every promise counts working hours only: Monday to Saturday, 9:30 to 18:30 India time
 * (9 working hours a day). Free is "usually" (not a promise); paid plans are promises. Urgent problems (can't publish,
 * locked out, a payment went wrong) get 4 working hours on paid plans.
 */

const IST_OFFSET_MIN = 330;
const DAY_START = 9 * 60 + 30;
const DAY_END = 18 * 60 + 30;
const WORKING_DAY_MIN = DAY_END - DAY_START;

/** Minutes since midnight India time, and the India weekday (0 Sunday). */
function ist(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { min: t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60, dow: t.getUTCDay() };
}

/** The moment `minutes` working minutes after `from`. */
export function addWorkingMinutes(from: Date, minutes: number): Date {
  let t = new Date(from.getTime());
  let left = minutes;
  for (let guard = 0; guard < 400; guard++) {
    const { min, dow } = ist(t);
    if (dow === 0 || min >= DAY_END) {
      // Jump to 9:30 the next India day.
      t = new Date(t.getTime() + ((24 * 60 - min) + DAY_START) * 60_000);
      continue;
    }
    if (min < DAY_START) { t = new Date(t.getTime() + (DAY_START - min) * 60_000); continue; }
    const today = DAY_END - min;
    if (left <= today) return new Date(t.getTime() + left * 60_000);
    left -= today;
    t = new Date(t.getTime() + today * 60_000);
  }
  return t;
}

/** Working minutes between two moments (0 if `to` is earlier). */
export function workingMinutesBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let n = 0;
  let t = new Date(from.getTime());
  for (let guard = 0; guard < 400 && t < to; guard++) {
    const { min, dow } = ist(t);
    if (dow === 0 || min >= DAY_END) { t = new Date(t.getTime() + ((24 * 60 - min) + DAY_START) * 60_000); continue; }
    if (min < DAY_START) { t = new Date(t.getTime() + (DAY_START - min) * 60_000); continue; }
    const end = new Date(t.getTime() + (DAY_END - min) * 60_000);
    const stop = end < to ? end : to;
    n += (stop.getTime() - t.getTime()) / 60_000;
    t = end;
  }
  return Math.round(n);
}

export const WORKING_HOURS_TEXT = 'Mon–Sat, 9:30 am to 6:30 pm IST';

/** What the person can report. `urgent` problems get the 4-hour promise on paid plans. */
export const SUPPORT_KINDS = [
  { key: 'cant_publish', label: 'I can’t publish a job', category: 'JOB_BOARD', urgent: true },
  { key: 'locked_out', label: 'I can’t sign in or I’m locked out', category: 'ACCOUNT', urgent: true },
  { key: 'payment', label: 'A payment or invoice went wrong', category: 'BILLING', urgent: true },
  { key: 'broken', label: 'Something is broken or shows an error', category: 'BUG_REPORT', urgent: false },
  { key: 'candidates', label: 'Candidates, emails or the pipeline', category: 'JOB_BOARD', urgent: false },
  { key: 'import', label: 'Moving from another tool (import)', category: 'JOB_BOARD', urgent: false },
  { key: 'idea', label: 'An idea or a missing feature', category: 'FEATURE_REQUEST', urgent: false },
  { key: 'other', label: 'Something else', category: 'OTHER', urgent: false },
] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number]['key'];

export interface ReplyPromise { workingMinutes: number; guaranteed: boolean; text: string; whatsapp: boolean }

/** The first-reply promise for a plan (FREE, GROWTH, PRO, SCALE) and whether the problem is urgent. */
export function replyPromise(plan: string, urgent: boolean): ReplyPromise {
  const p = plan.toUpperCase();
  if (p === 'SCALE') return { workingMinutes: 4 * 60, guaranteed: true, text: 'We reply within 4 working hours. You can also message us on WhatsApp.', whatsapp: true };
  const paid = p === 'PRO' || p === 'GROWTH';
  if (paid && urgent) return { workingMinutes: 4 * 60, guaranteed: true, text: 'Urgent: we reply within 4 working hours.', whatsapp: false };
  if (p === 'PRO') return { workingMinutes: WORKING_DAY_MIN, guaranteed: true, text: 'We reply within 1 working day.', whatsapp: false };
  if (p === 'GROWTH') return { workingMinutes: 2 * WORKING_DAY_MIN, guaranteed: true, text: 'We reply within 2 working days.', whatsapp: false };
  return { workingMinutes: 2 * WORKING_DAY_MIN, guaranteed: false, text: 'We usually reply within 2 working days.', whatsapp: false };
}

/** "in 3 h", "overdue by 1 day" style text for the admin queue (working time). */
export function dueText(due: Date, now = new Date()): { text: string; overdue: boolean } {
  const overdue = due < now;
  const m = overdue ? workingMinutesBetween(due, now) : workingMinutesBetween(now, due);
  const span = m < 60 ? `${Math.max(1, m)} min` : m < WORKING_DAY_MIN ? `${Math.round(m / 60)} h` : `${(m / WORKING_DAY_MIN).toFixed(1).replace(/\.0$/, '')} working days`;
  return { text: overdue ? `overdue by ${span}` : `due in ${span}`, overdue };
}

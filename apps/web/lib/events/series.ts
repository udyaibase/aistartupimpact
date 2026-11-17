import { prisma, Prisma } from '@udyaibase/database';
import { sendEmail, sendEmailBatch } from '@/lib/email/send';
import { seriesFollowToken } from './after-event';
import { duplicateEvent } from './duplicate';
import { utcToZoned } from './zoned-time';

/**
 * Event series ("Bengaluru AI Meetup"): one public page listing every edition, people can follow it (double opt-in)
 * and get one email when a new edition is published. A series can repeat: a daily job copies the template event
 * as a draft ahead of each date and tells the host to review and publish it. Nothing is published automatically.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
export const MAX_SERIES_PER_ORGANIZER = 25;
/** Drafts created per series per run, so a long gap never floods the host. */
const MAX_DRAFTS_PER_RUN = 3;

export type Recurrence = {
  freq: 'WEEKLY' | 'MONTHLY';
  /** Every n weeks (1–4) or months (1–3). */
  interval: number;
  /** MONTHLY only: which week of the month (1–4, or -1 for the last). The weekday comes from the template. */
  monthWeek: number | null;
  /** How many days before each date the draft is created. */
  createAheadDays: number;
  templateEventId: string;
};

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
  return { freq, interval, monthWeek, createAheadDays, templateEventId: r.templateEventId };
}

export function describeRecurrence(r: Recurrence, weekday: number): string {
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday];
  if (r.freq === 'WEEKLY') return r.interval === 1 ? `Every ${day}` : `Every ${r.interval} weeks on ${day}`;
  const nth = r.monthWeek === -1 ? 'last' : ['first', 'second', 'third', 'fourth'][(r.monthWeek ?? 1) - 1];
  return `The ${nth} ${day} of every ${r.interval === 1 ? 'month' : `${r.interval} months`}`;
}

// ── Calendar dates as YYYY-MM-DD (no time zone; the event's own zone is applied when the draft is made) ──
const toDay = (s: string) => new Date(`${s}T00:00:00Z`);
const fromDay = (d: Date) => d.toISOString().slice(0, 10);
export const weekdayOf = (s: string) => toDay(s).getUTCDay();
export const addDays = (s: string, n: number) => fromDay(new Date(toDay(s).getTime() + n * 86_400_000));

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

/** Dates after `after` up to and including `until`, following the rule from the template's date. */
export function occurrencesBetween(rule: Recurrence, templateDate: string, after: string, until: string, limit = 10): string[] {
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

export function slugifySeries(name: string): string {
  return name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'series';
}

export async function uniqueSeriesSlug(name: string, exceptId?: string): Promise<string> {
  const base = slugifySeries(name);
  for (let i = 1; i <= 30; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const taken = await prisma.eventSeries.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken || taken.id === exceptId) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

export const seriesUrl = (slug: string) => `${SITE}/series/${slug}`;
export const confirmFollowUrl = (followerId: string) => `${SITE}/api/series/follow/confirm?t=${encodeURIComponent(seriesFollowToken(followerId, 'confirm'))}`;
export const stopFollowUrl = (followerId: string) => `${SITE}/series/unfollow?t=${encodeURIComponent(seriesFollowToken(followerId, 'stop'))}`;
export const stopFollowPostUrl = (followerId: string) => `${SITE}/api/series/follow/stop?t=${encodeURIComponent(seriesFollowToken(followerId, 'stop'))}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function shell(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">${body}</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0;line-height:1.6">${footer}</p>
</td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:22px 0 6px"><a href="${href}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${esc(label)}</a></p>`;

/** Step one of following: confirm the address. Nothing else is sent until they do. */
export async function sendFollowConfirmation(f: { id: string; email: string }, series: { name: string; slug: string }) {
  return sendEmail({
    to: f.email, type: 'series_follow_confirm', subject: `Confirm: updates from ${series.name}`,
    html: shell(
      `<h1 style="margin:0 0 12px;font-size:20px;color:#111827">Confirm you want updates</h1>
<p style="margin:0;font-size:15px;line-height:1.6">Confirm and we’ll email you when the next <strong>${esc(series.name)}</strong> event opens for registration. One email per event, nothing else.</p>
${button(confirmFollowUrl(f.id), 'Confirm')}`,
      `Didn’t ask for this? Ignore this email and you won’t hear from us.`,
    ),
  });
}

function eventWhen(e: { startAt: Date; timezone: string }): string {
  const { date, time } = utcToZoned(e.startAt, e.timezone);
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return time ? `${d}, ${time}` : d;
}

/** Tell confirmed followers about newly published editions. Each event is announced once. */
export async function announceNewEditions(now = new Date()) {
  const events = await prisma.event.findMany({
    where: { seriesId: { not: null }, seriesAnnouncedAt: null, status: 'PUBLISHED', deletedAt: null, visibility: 'PUBLIC', startAt: { gt: now } },
    select: { id: true, slug: true, title: true, startAt: true, timezone: true, venueName: true, format: true, series: { select: { id: true, name: true, slug: true } } },
    take: 20,
  });
  let sent = 0;
  for (const e of events) {
    // Claim first so two runs never email twice.
    const claimed = await prisma.event.updateMany({ where: { id: e.id, seriesAnnouncedAt: null }, data: { seriesAnnouncedAt: now } });
    if (!claimed.count || !e.series) continue;
    const followers = await prisma.eventSeriesFollower.findMany({
      where: { seriesId: e.series.id, confirmedAt: { not: null }, unsubscribedAt: null },
      select: { id: true, email: true }, take: 5000,
    });
    const where = e.format === 'VIRTUAL' ? 'Online' : e.venueName ?? '';
    for (let i = 0; i < followers.length; i += 100) {
      const batch = followers.slice(i, i + 100);
      const results = await sendEmailBatch(batch.map((f) => ({
        to: f.email, type: 'series_new_event', subject: `New: ${e.title}`,
        headers: { 'List-Unsubscribe': `<${stopFollowPostUrl(f.id)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        html: shell(
          `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6b7280">${esc(e.series!.name)}</p>
<h1 style="margin:0 0 10px;font-size:20px;color:#111827">${esc(e.title)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6">${esc(eventWhen(e))}${where ? ` · ${esc(where)}` : ''}</p>
${button(`${SITE}/events/${e.slug}`, 'See the event and register')}`,
          `You follow <a href="${seriesUrl(e.series!.slug)}" style="color:#6b7280">${esc(e.series!.name)}</a> on Udyaibase Events.<br><a href="${stopFollowUrl(f.id)}" style="color:#6b7280">Stop these emails</a>`,
        ),
      })), { idempotencyKey: `series-new-${e.id}-${i}` });
      sent += results.filter((r) => r.success).length;
    }
  }
  return { events: events.length, sent };
}

/** Create drafts for upcoming dates of repeating series and tell the host. */
export async function generateRecurringDrafts(now = new Date()) {
  const all = await prisma.eventSeries.findMany({
    where: { NOT: { recurrence: { equals: Prisma.AnyNull } } },
    select: { id: true, name: true, organizerId: true, recurrence: true, lastGeneratedFor: true, organizer: { select: { email: true, name: true } } },
  });
  let created = 0;
  for (const s of all) {
    const rule = cleanRecurrence(s.recurrence);
    if (!rule) continue;
    const template = await prisma.event.findFirst({ where: { id: rule.templateEventId, organizerId: s.organizerId, deletedAt: null }, select: { id: true, startAt: true, timezone: true } });
    if (!template) continue;
    const tz = template.timezone;
    const templateDate = utcToZoned(template.startAt, tz).date;
    const today = utcToZoned(now, tz).date;
    const last = s.lastGeneratedFor ? utcToZoned(s.lastGeneratedFor, tz).date : templateDate;
    const after = last > today ? last : today;
    const dates = occurrencesBetween(rule, templateDate, after, addDays(today, rule.createAheadDays), MAX_DRAFTS_PER_RUN);
    const made: { id: string; title: string; date: string }[] = [];
    for (const date of dates) {
      // Skip a date the host already has an edition on (made by hand, or a re-run).
      const existing = await prisma.event.count({ where: { seriesId: s.id, deletedAt: null, startAt: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(`${addDays(date, 1)}T00:00:00Z`) } } });
      if (!existing) {
        const r = await duplicateEvent(template.id, s.organizerId, date);
        // A date that can't be made (e.g. too soon) is skipped, never retried forever.
        if (r.ok) {
          await prisma.event.update({ where: { id: r.id }, data: { seriesId: s.id } });
          made.push({ id: r.id, title: r.title, date });
        }
      }
      await prisma.eventSeries.update({ where: { id: s.id }, data: { lastGeneratedFor: new Date(`${date}T12:00:00Z`) } });
    }
    created += made.length;
    if (made.length && s.organizer.email) {
      const list = made.map((m) => `<li style="margin:0 0 6px"><a href="${SITE}/organizer/events/${m.id}" style="color:#111827;font-weight:600">${esc(m.title)}</a> · ${esc(new Date(`${m.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }))}</li>`).join('');
      await sendEmail({
        to: s.organizer.email, type: 'series_draft_ready', subject: `${made.length === 1 ? 'Next' : `${made.length} new`} ${s.name} ${made.length === 1 ? 'event is' : 'events are'} ready to review`,
        html: shell(
          `<h1 style="margin:0 0 12px;font-size:20px;color:#111827">Ready to review</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6">We copied your template to the next ${made.length === 1 ? 'date' : 'dates'} as a draft. Check the details and publish when you’re ready. Followers hear about it once it’s published.</p>
<ul style="padding-left:18px;margin:0;font-size:14px">${list}</ul>`,
          `You set ${esc(s.name)} to repeat on Udyaibase Events. Change or stop it in your organizer portal under Series.`,
        ),
      }).catch(() => {});
    }
  }
  return { series: all.length, created };
}

import { prisma, Prisma } from '@udyaibase/database';
import { sendEmail, sendEmailBatch } from '@/lib/email/send';
import { seriesFollowToken } from './after-event';
import { duplicateEvent } from './duplicate';
import { utcToZoned } from './zoned-time';
import { addDays, cleanRecurrence, plannedDates } from './recurrence';
import { notifyOrganizer } from '@/lib/organizer-notify';

/**
 * Event series ("Bengaluru AI Meetup"): one public page listing every edition, people can follow it (double opt-in)
 * and get one email when a new edition is published. A series can repeat: a daily job copies the template event
 * as a draft ahead of each date and tells the host to review and publish it. Nothing is published automatically.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
export const MAX_SERIES_PER_ORGANIZER = 25;
/** Drafts created per series per run, so a long gap never floods the host. */
const MAX_DRAFTS_PER_RUN = 3;

export type { Recurrence } from './recurrence';
export { cleanRecurrence, describeRecurrence, occurrencesBetween, plannedDates, weekdayOf, addDays, scheduleKey } from './recurrence';

export function slugifySeries(name: string): string {
  return name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'series';
}

export async function uniqueSeriesSlug(name: string, exceptId?: string): Promise<string> {
  // "join" and "unfollow" are pages under /series/, so a series can't take those addresses.
  const raw = slugifySeries(name);
  const base = ['join', 'unfollow'].includes(raw) ? `${raw}-series` : raw;
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
    // Paused: nothing is made, and dates that pass meanwhile aren't created later (the window starts from today).
    if (!rule || rule.paused) continue;
    const template = await prisma.event.findFirst({ where: { id: rule.templateEventId, organizerId: s.organizerId, deletedAt: null }, select: { id: true, startAt: true, timezone: true } });
    if (!template) continue;
    const tz = template.timezone;
    const templateDate = utcToZoned(template.startAt, tz).date;
    const today = utcToZoned(now, tz).date;
    const last = s.lastGeneratedFor ? utcToZoned(s.lastGeneratedFor, tz).date : templateDate;
    const after = last > today ? last : today;
    // Within the end date; skipped dates are passed over (and recorded as done) without making a draft.
    const dates = plannedDates(rule, templateDate, after, addDays(today, rule.createAheadDays), MAX_DRAFTS_PER_RUN);
    const made: { id: string; title: string; date: string }[] = [];
    for (const { date, skipped } of dates) {
      if (skipped) {
        await prisma.eventSeries.update({ where: { id: s.id }, data: { lastGeneratedFor: new Date(`${date}T12:00:00Z`) } });
        continue;
      }
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
    if (made.length) {
      await notifyOrganizer(s.organizerId, {
        type: 'series_draft_ready',
        title: `${made.length === 1 ? 'Next' : `${made.length} new`} ${s.name} ${made.length === 1 ? 'event is' : 'events are'} ready to review`,
        message: 'We copied your template to the next date as a draft. Check the details and publish when you’re ready.',
        link: made.length === 1 ? `/organizer/events/${made[0].id}` : '/organizer/events',
      });
    }
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

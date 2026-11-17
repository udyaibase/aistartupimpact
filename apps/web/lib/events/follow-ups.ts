import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { eventPeople, fillTemplate, followUpSettings, followUpsLeft, hostOptOutToken } from './after-event';
import { certificatePageUrl } from './certificates';
import { feedbackSettings, feedbackUrl } from './feedback';

/**
 * Follow-up emails after an event, sent to the event's own registrants (not the Udyaibase subscriber list):
 * people who checked in get the thank-you (with their certificate link if they have one); people who registered
 * but didn't come get "sorry we missed you" (if the host keeps that on). Recorded as a FOLLOW_UP campaign so the
 * Free allowance can be counted. Everyone who opted out of this host's emails is skipped.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The host's plain-text message as safe HTML paragraphs. */
export function messageHtml(text: string): string {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/** One-tap rating row: each star opens the feedback form with that rating already chosen. */
export function ratingRowHtml(urlFor: (rating: number) => string): string {
  const cells = [1, 2, 3, 4, 5].map((n) => `<td style="padding:0 3px"><a href="${urlFor(n)}" style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;color:#111827">${n}</a></td>`).join('');
  return `<p style="margin:22px 0 8px;font-size:14px;font-weight:600;color:#111827">How was it? Tap a rating (1 = poor, 5 = excellent)</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

export function followUpEmailHtml(opts: { message: string; hostName: string; eventTitle: string; eventUrl: string; certificateUrl?: string | null; optOutUrl: string; ratingHtml?: string }): string {
  const cert = opts.certificateUrl
    ? `<p style="margin:22px 0 6px"><a href="${opts.certificateUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">Get your certificate</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#6b7280">Download it as a PDF or add it to your LinkedIn profile.</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
${messageHtml(opts.message)}
${opts.ratingHtml ?? ''}
${cert}
<p style="margin:18px 0 0;font-size:14px;color:#374151">${esc(opts.hostName)}</p>
</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0;line-height:1.6">You got this because you registered for <a href="${opts.eventUrl}" style="color:#6b7280">${esc(opts.eventTitle)}</a> on Udyaibase Events.<br>
<a href="${opts.optOutUrl}" style="color:#6b7280">Stop emails from ${esc(opts.hostName)} about this event</a></p>
</td></tr></table></body></html>`;
}

export type FollowUpResult =
  | { ok: true; sent: number; attended: number; missed: number; skipped: number }
  | { ok: false; error: string; status: number };

/** Send the follow-up for an event now. `auto` marks the automatic send (2 hours after the end). */
export async function sendFollowUp(eventId: string, opts: { auto?: boolean } = {}): Promise<FollowUpResult> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true, slug: true, title: true, organizerId: true, startAt: true, endAt: true, status: true, followUpSettings: true, feedbackSettings: true,
      organizer: { select: { name: true, company: true, email: true } },
    },
  });
  if (!event) return { ok: false, error: 'Event not found.', status: 404 };
  if (event.startAt > new Date()) return { ok: false, error: 'Follow-ups can be sent once the event has started.', status: 400 };

  const left = await followUpsLeft(event);
  if (left !== null && left <= 0) {
    return { ok: false, error: 'You’ve used this event’s free follow-up. Upgrade to Pro to send more.', status: 402 };
  }

  const settings = followUpSettings(event.followUpSettings, event.title);
  const askFeedback = feedbackSettings(event.feedbackSettings).enabled;
  const people = (await eventPeople(event.id)).filter((p) => p.email);
  const attended = people.filter((p) => p.attended && !p.optedOut);
  const missed = settings.includeMissed ? people.filter((p) => !p.attended && !p.optedOut) : [];
  const skipped = people.filter((p) => p.optedOut).length;
  if (!attended.length && !missed.length) return { ok: false, error: 'There’s nobody to email yet.', status: 400 };

  const hostName = event.organizer.company || event.organizer.name;
  const campaign = await prisma.eventEmailCampaign.create({
    data: {
      eventId: event.id, organizerId: event.organizerId, kind: 'FOLLOW_UP', subject: settings.attendedSubject,
      status: 'SENDING', audienceQuery: { attended: attended.length, missed: missed.length, auto: !!opts.auto },
    },
    select: { id: true },
  });

  const eventUrl = `${SITE}/events/${event.slug}`;
  let sent = 0;
  const sendOne = async (p: (typeof people)[number], group: 'attended' | 'missed') => {
    const vars = { name: p.name.split(' ')[0] || 'there', event: event.title };
    const subject = fillTemplate(group === 'attended' ? settings.attendedSubject : settings.missedSubject, vars);
    const message = fillTemplate(group === 'attended' ? settings.attendedBody : settings.missedBody, vars);
    const optOutUrl = `${SITE}/events/stop-emails?t=${encodeURIComponent(hostOptOutToken(p.id))}`;
    const r = await sendEmail({
      to: p.email,
      subject,
      type: 'event_follow_up',
      // RFC 8058 one-click: mail apps POST to the signed endpoint; the link in the email opens a confirm page.
      headers: {
        'List-Unsubscribe': `<${SITE}/api/events/stop-emails?t=${encodeURIComponent(hostOptOutToken(p.id))}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: followUpEmailHtml({
        message, hostName, eventTitle: event.title, eventUrl, optOutUrl,
        certificateUrl: group === 'attended' && p.certificateCode ? certificatePageUrl(p.certificateCode) : null,
        ratingHtml: group === 'attended' && askFeedback ? ratingRowHtml((n) => feedbackUrl(p.id, n)) : undefined,
      }),
    });
    if (r.success) sent++;
  };

  // Small batches: kind to the email provider's rate limit, still quick for a few hundred people.
  const queue: [(typeof people)[number], 'attended' | 'missed'][] = [...attended.map((p) => [p, 'attended'] as [typeof p, 'attended']), ...missed.map((p) => [p, 'missed'] as [typeof p, 'missed'])];
  for (let i = 0; i < queue.length; i += 8) {
    await Promise.all(queue.slice(i, i + 8).map(([p, g]) => sendOne(p, g)));
  }

  await prisma.eventEmailCampaign.update({
    where: { id: campaign.id },
    data: { status: sent > 0 ? 'SENT' : 'FAILED', sentAt: new Date(), recipientCount: sent },
  });
  if (opts.auto) await prisma.event.update({ where: { id: event.id }, data: { followUpAutoSentAt: new Date() } });
  if (sent === 0) return { ok: false, error: 'The emails couldn’t be sent. Try again in a few minutes.', status: 502 };
  return { ok: true, sent, attended: attended.length, missed: missed.length, skipped };
}

/** Cron: automatic follow-ups 2 hours after an event ends (once per event, only where the host turned it on). */
export async function runAutoFollowUps(now = new Date()): Promise<{ sent: number; events: number }> {
  const due = await prisma.event.findMany({
    where: {
      deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] }, followUpAutoSentAt: null,
      endAt: { lte: new Date(now.getTime() - 2 * 3_600_000), gte: new Date(now.getTime() - 3 * 86_400_000) },
      followUpSettings: { path: ['auto'], equals: true },
    },
    select: { id: true },
    take: 20,
  });
  let sent = 0;
  for (const e of due) {
    const r = await sendFollowUp(e.id, { auto: true }).catch(() => null);
    // Mark it either way so a failing event isn't retried every run; the host can still send by hand.
    if (!r || !r.ok) await prisma.event.update({ where: { id: e.id }, data: { followUpAutoSentAt: now } }).catch(() => {});
    if (r?.ok) sent += r.sent;
  }
  return { sent, events: due.length };
}

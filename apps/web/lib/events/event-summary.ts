import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { notifyOrganizer } from '@/lib/organizer-notify';

/**
 * Post-event summary: registered, attended, attendance rate, where registrations came from, feedback and
 * certificates. Shown on the "After the event" page and emailed to the host the day after.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

const SOURCE_LABEL: Record<string, string> = { WEBSITE: 'Udyaibase event page', EMBED: 'Your website widget', EVENT_QR: 'Event QR code', WALK_IN: 'Walk-ins' };

export interface EventSummary {
  registered: number;
  attended: number;
  attendanceRate: number | null;
  sources: { label: string; count: number }[];
  feedback: { responses: number; average: number | null };
  certificates: number;
}

export async function eventSummary(eventId: string): Promise<EventSummary> {
  const live = { eventId, deletedAt: null, cancelledAt: null, status: { in: ['CONFIRMED', 'CHECKED_IN'] as ('CONFIRMED' | 'CHECKED_IN')[] } };
  const [registered, attended, bySource, byUtm, fb, certificates] = await Promise.all([
    prisma.eventRegistration.count({ where: live }),
    prisma.eventRegistration.count({ where: { ...live, checkedInAt: { not: null } } }),
    prisma.eventRegistration.groupBy({ by: ['registrationSource'], where: live, _count: { _all: true } }),
    prisma.eventRegistration.groupBy({ by: ['utmSource'], where: { ...live, utmSource: { not: null } }, _count: { _all: true }, orderBy: { _count: { utmSource: 'desc' } }, take: 5 }),
    prisma.eventFeedback.aggregate({ where: { eventId }, _count: { _all: true }, _avg: { rating: true } }),
    prisma.eventCertificate.count({ where: { eventId, revokedAt: null } }),
  ]);
  const sources = [
    ...bySource.map((s) => ({ label: SOURCE_LABEL[s.registrationSource] ?? s.registrationSource, count: s._count._all })),
    ...byUtm.map((u) => ({ label: `Link tagged “${u.utmSource}”`, count: u._count._all })),
  ].filter((s) => s.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
  return {
    registered,
    attended,
    attendanceRate: registered ? Math.round((attended / registered) * 100) : null,
    sources,
    feedback: { responses: fb._count._all, average: fb._avg.rating ? Math.round(fb._avg.rating * 10) / 10 : null },
    certificates,
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function summaryEmailHtml(e: { title: string; id: string }, s: EventSummary, hostName: string): string {
  const stat = (label: string, value: string) => `<td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;width:33%"><div style="font-size:12px;color:#6b7280">${label}</div><div style="font-size:20px;font-weight:700;color:#111827;margin-top:2px">${value}</div></td>`;
  const sources = s.sources.length
    ? `<p style="margin:20px 0 6px;font-size:14px;font-weight:600;color:#111827">Where registrations came from</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${s.sources.map((x) => `<tr><td style="padding:4px 0;font-size:14px;color:#374151">${esc(x.label)}</td><td style="padding:4px 0;font-size:14px;color:#111827;text-align:right;font-weight:600">${x.count}</td></tr>`).join('')}</table>`
    : '';
  const extra = [
    s.feedback.responses ? `Rated ${s.feedback.average?.toFixed(1)} out of 5 by ${s.feedback.responses} ${s.feedback.responses === 1 ? 'person' : 'people'} so far.` : null,
    s.certificates ? `${s.certificates} certificate${s.certificates === 1 ? '' : 's'} issued.` : null,
  ].filter(Boolean).map((t) => `<p style="margin:12px 0 0;font-size:14px;color:#374151">${t}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
<p style="margin:0;font-size:13px;color:#6b7280">How your event went</p>
<h1 style="font-size:20px;margin:4px 0 18px;color:#111827">${esc(e.title)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${stat('Registered', String(s.registered))}${stat('Attended', String(s.attended))}${stat('Attendance', s.attendanceRate === null ? '–' : `${s.attendanceRate}%`)}</tr></table>
${sources}${extra}
<p style="margin:22px 0 0"><a href="${SITE}/organizer/events/${e.id}/after" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">Send thanks, certificates and a survey</a></p>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280">Hi ${esc(hostName)}, attendance counts people checked in at the door.</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Daily: the day after a host's event ends, email them how it went (once per event). */
export async function runEventSummaries(now = new Date()): Promise<{ sent: number }> {
  const due = await prisma.event.findMany({
    where: {
      deletedAt: null, sourceUrl: null, summarySentAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] }, registrationCount: { gt: 0 },
      endAt: { lte: new Date(now.getTime() - 18 * 3_600_000), gte: new Date(now.getTime() - 7 * 86_400_000) },
    },
    select: { id: true, title: true, organizerId: true, organizer: { select: { email: true, name: true } } },
    take: 100,
  });
  let sent = 0;
  for (const e of due) {
    // Mark first, so a slow or failing email never sends twice.
    const claimed = await prisma.event.updateMany({ where: { id: e.id, summarySentAt: null }, data: { summarySentAt: now } });
    if (!claimed.count || !e.organizer?.email || /@udyaibase\.com$/i.test(e.organizer.email)) continue;
    const s = await eventSummary(e.id);
    if (s.registered === 0) continue;
    await notifyOrganizer(e.organizerId, { type: 'event_summary', title: `How ${e.title} went`, message: `${s.attended} of ${s.registered} registered people attended. See the full summary and follow up with attendees.`, link: `/organizer/events/${e.id}/after` });
    const r = await sendEmail({ to: e.organizer.email, type: 'event_summary', subject: `How ${e.title} went: ${s.attended} attended`, html: summaryEmailHtml(e, s, e.organizer.name) });
    if (r.success) sent++;
  }
  return { sent };
}

import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { cleanTimeZone, zonedToUtc } from '@/lib/events/zoned-time';
import { employerContext } from '@/lib/employer/applications';
import { moveApplications } from '@/lib/employer/pipeline';
import { roundsOf } from '@/lib/employer/rounds';
import { isRealInbox } from '@/lib/employer/owners';

/**
 * Scheduling an interview: pick a time and the panel. The candidate and panel get an email with a calendar file that
 * works in Google, Outlook and Apple Calendar, plus the meeting link the team pasted.
 */

export const DURATIONS = [30, 45, 60, 90] as const;

/** RFC 5545 calendar invite; times in UTC so every calendar app shows them right. */
export function interviewIcs(o: {
  uid: string; title: string; description: string; startAt: Date; endAt: Date; organizer: { name: string; email: string };
  attendees: string[]; location?: string | null; method: 'REQUEST' | 'CANCEL'; sequence?: number;
}): string {
  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Udyaibase//Hiring//EN', 'CALSCALE:GREGORIAN', `METHOD:${o.method}`,
    'BEGIN:VEVENT',
    `UID:${o.uid}`,
    `SEQUENCE:${o.sequence ?? 0}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(o.startAt)}`,
    `DTEND:${utc(o.endAt)}`,
    fold(`SUMMARY:${text(o.title)}`),
    fold(`DESCRIPTION:${text(o.description)}`),
    ...(o.location ? [fold(`LOCATION:${text(o.location)}`)] : []),
    fold(`ORGANIZER;CN=${text(o.organizer.name)}:mailto:${o.organizer.email}`),
    ...o.attendees.map((a) => fold(`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a}`)),
    `STATUS:${o.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export type ScheduleInput = { round?: unknown; date?: unknown; time?: unknown; duration?: unknown; timezone?: unknown; panel?: unknown; meetingUrl?: unknown };

export async function scheduleInterview(opts: {
  employerId: string; applicationId: string; actor: { email: string; name: string }; jobIds: string[] | null; input: ScheduleInput; now?: Date;
}): Promise<{ ok: true; id: string; meetingUrl: string | null } | { ok: false; error: string; status: number }> {
  const now = opts.now ?? new Date();
  const app = await prisma.jobBoardApplication.findFirst({
    where: { id: opts.applicationId, Listing: { employerId: opts.employerId, ...(opts.jobIds ? { id: { in: opts.jobIds } } : {}) }, withdrawnAt: null, NOT: { email: { endsWith: '@deleted.invalid' } } },
    select: { id: true, email: true, fullName: true, status: true, Listing: { select: { title: true, interviewRounds: true } } },
  });
  if (!app) return { ok: false, error: 'Candidate not found.', status: 404 };
  if (app.status === 'REJECTED' || app.status === 'HIRED') return { ok: false, error: 'Move them back into the pipeline first.', status: 409 };

  const i = opts.input;
  const rounds = roundsOf(app.Listing.interviewRounds);
  const round = typeof i.round === 'string' && rounds.includes(i.round) ? i.round : rounds[0];
  const tz = cleanTimeZone(i.timezone);
  const startAt = typeof i.date === 'string' && typeof i.time === 'string' ? zonedToUtc(i.date, i.time, tz) : null;
  if (!startAt) return { ok: false, error: 'Pick a date and time.', status: 400 };
  if (startAt.getTime() < now.getTime() + 10 * 60_000) return { ok: false, error: 'Pick a time at least 10 minutes from now.', status: 400 };
  if (startAt.getTime() > now.getTime() + 120 * 864e5) return { ok: false, error: 'Pick a time within the next 4 months.', status: 400 };
  const duration = DURATIONS.includes(Number(i.duration) as never) ? Number(i.duration) : 45;
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  const meetingUrl = typeof i.meetingUrl === 'string' && /^https:\/\/\S+$/.test(i.meetingUrl.trim()) && i.meetingUrl.length <= 300 ? i.meetingUrl.trim() : null;

  // The panel can only be people on this hiring team (so the form can't be used to email strangers).
  const team = await prisma.jobBoardTeamMember.findMany({ where: { employerId: opts.employerId, status: 'ACTIVE' }, select: { email: true } });
  const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: opts.employerId }, select: { email: true } });
  const allowed = new Set([...team.map((t) => t.email.toLowerCase()), ...(employer && isRealInbox(employer.email) ? [employer.email.toLowerCase()] : [])]);
  const panel = Array.from(new Set((Array.isArray(i.panel) ? i.panel : []).filter((e): e is string => typeof e === 'string').map((e) => e.toLowerCase())))
    .filter((e) => allowed.has(e)).slice(0, 8);

  const ctx = await employerContext(opts.employerId);
  const title = `Interview: ${app.fullName} · ${app.Listing.title}${rounds.length > 1 ? ` (${round})` : ''} · ${ctx.company}`;
  const when = startAt.toLocaleString('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  const link = meetingUrl;

  const interview = await prisma.jobBoardInterview.create({
    data: { applicationId: app.id, round, startAt, endAt, timezone: tz, panelEmails: panel, meetingUrl: link, createdByEmail: opts.actor.email },
    select: { id: true },
  });

  const ics = interviewIcs({
    uid: `interview-${interview.id}@udyaibase.com`, title, startAt, endAt, method: 'REQUEST',
    description: `${round} for ${app.Listing.title} at ${ctx.company}.${link ? ` Join: ${link}` : ''}`,
    organizer: { name: ctx.company, email: opts.actor.email }, attendees: [app.email, ...panel], location: link,
  });
  const first = app.fullName.split(' ')[0] || app.fullName;
  const html = shell(`
<h1 style="font-size:20px;margin:0 0 8px">Interview with ${esc(ctx.company)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(first)}, your ${esc(round === 'Interview' ? 'interview' : `${round} interview`)} for <strong>${esc(app.Listing.title)}</strong> is on <strong>${esc(when)}</strong> (${duration} minutes).</p>
${link ? `<p style="margin:0 0 20px">${button(link, 'Join the call')}</p>` : '<p style="margin:0 0 20px;font-size:15px">The team will share how to join before the call.</p>'}
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">The attached invite adds it to your calendar. Need another time? Reply to this email.</p>`);
  const attachments = [{ filename: 'interview.ics', content: ics, contentType: 'text/calendar; method=REQUEST; charset=UTF-8' }];
  await sendEmail({ to: app.email, subject: `Interview: ${app.Listing.title} at ${ctx.company}`.replace(/[\r\n]+/g, ' '), html, replyTo: opts.actor.email, attachments, type: 'interview_invite' });
  for (const p of panel) {
    await sendEmail({ to: p, subject: `Interview: ${app.fullName} · ${app.Listing.title}`.replace(/[\r\n]+/g, ' '), html: shell(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6">You’re on the panel for <strong>${esc(app.fullName)}</strong> (${esc(round)}, ${esc(app.Listing.title)}) on <strong>${esc(when)}</strong>.</p>${link ? `<p>${button(link, 'Join the call')}</p>` : ''}`), attachments, type: 'interview_panel' });
  }

  // Scheduling puts them in the Interview stage at that round (no extra stage email).
  if (app.status !== 'INTERVIEW') {
    await moveApplications({ employerId: opts.employerId, actorEmail: opts.actor.email, company: ctx.company, ids: [app.id], toStatus: 'INTERVIEW', round, batchKey: `interview-${interview.id}` });
  } else {
    await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { interviewRound: round } });
  }
  return { ok: true, id: interview.id, meetingUrl: link };
}

export async function listInterviews(applicationId: string) {
  const rows = await prisma.jobBoardInterview.findMany({ where: { applicationId }, orderBy: { startAt: 'desc' }, take: 20 });
  return rows.map((r) => ({
    id: r.id, round: r.round, startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString(), timezone: r.timezone, panelEmails: r.panelEmails,
    meetingUrl: r.meetingUrl, status: r.status, createdByEmail: r.createdByEmail,
  }));
}

/** Cancels it and emails the candidate a calendar cancellation. */
export async function cancelInterview(opts: { employerId: string; interviewId: string; actorEmail: string; jobIds: string[] | null }): Promise<boolean> {
  const iv = await prisma.jobBoardInterview.findFirst({
    where: { id: opts.interviewId, status: 'SCHEDULED', Application: { Listing: { employerId: opts.employerId, ...(opts.jobIds ? { id: { in: opts.jobIds } } : {}) } } },
    select: { id: true, round: true, startAt: true, endAt: true, timezone: true, panelEmails: true, Application: { select: { email: true, fullName: true, Listing: { select: { title: true } } } } },
  });
  if (!iv) return false;
  await prisma.jobBoardInterview.update({ where: { id: iv.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  const ctx = await employerContext(opts.employerId);
  const title = `Interview: ${iv.Application.fullName} · ${iv.Application.Listing.title} · ${ctx.company}`;
  const ics = interviewIcs({
    uid: `interview-${iv.id}@udyaibase.com`, title, description: 'Cancelled', startAt: iv.startAt, endAt: iv.endAt, method: 'CANCEL', sequence: 1,
    organizer: { name: ctx.company, email: opts.actorEmail }, attendees: [iv.Application.email, ...iv.panelEmails],
  });
  const when = iv.startAt.toLocaleString('en-IN', { timeZone: iv.timezone, day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  await sendEmail({
    to: iv.Application.email, replyTo: opts.actorEmail, type: 'interview_cancelled',
    subject: `Interview cancelled: ${iv.Application.Listing.title} at ${ctx.company}`.replace(/[\r\n]+/g, ' '),
    html: shell(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Your interview for <strong>${esc(iv.Application.Listing.title)}</strong> on ${esc(when)} has been cancelled. The team will be in touch about next steps.</p>`),
    attachments: [{ filename: 'cancel.ics', content: ics, contentType: 'text/calendar; method=CANCEL; charset=UTF-8' }],
  });
  return true;
}


import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { effectiveHostPlan, registrationLimit, EVENT_BOOST, HOST_PLANS } from '@/lib/events/plans';
import { sendConfirmationEmail } from '@/lib/events/register-event';
import { refreshPaths } from '@/lib/revalidate';

/**
 * Waitlist follow-ups: telling a host once when their plan's registration cap starts turning people away,
 * and moving waitlisted people into spots that open when the limit rises (Boost or Pro).
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const FROM = `Udyaibase Events <${process.env.RESEND_FROM_EMAIL || 'no-reply@udyaibase.com'}>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const shell = (body: string) => `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px">
<tr><td style="padding:32px">${body}</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Udyaibase Events &middot; AI events across India</p>
</td></tr></table></body></html>`;
const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${label}</a>`;
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/** To the attendee: on the waitlist (no ticket yet), or waiting for the host to approve. */
export function sendRegistrationStatusEmail(opts: { to: string; name: string; eventTitle: string; slug: string; status: 'WAITLISTED' | 'PENDING_APPROVAL'; position?: number }) {
  const waitlisted = opts.status === 'WAITLISTED';
  sendEmailFireAndForget({
    to: opts.to,
    from: FROM,
    subject: waitlisted ? `You’re on the waitlist for ${opts.eventTitle}` : `Request received: ${opts.eventTitle}`,
    type: waitlisted ? 'event_waitlisted' : 'event_pending_approval',
    html: shell(`<h1 style="font-size:20px;margin:0 0 8px">${waitlisted ? 'You’re on the waitlist' : 'Your request is with the host'}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(opts.name || 'there')}, ${waitlisted
      ? `<strong>${esc(opts.eventTitle)}</strong> is full right now${opts.position ? ` and you’re number ${opts.position} in line` : ''}. If a spot opens, you’ll get it automatically and we’ll email your ticket.`
      : `the host of <strong>${esc(opts.eventTitle)}</strong> reviews every request. We’ll email you, with your ticket, as soon as you’re approved.`}</p>
<p style="margin:0 0 16px;font-size:14px;color:#6b7280">This isn’t a ticket yet, so please don’t go to the venue until you hear from us.</p>
<p style="margin:0">${button(`${SITE}/events/${opts.slug}`, 'View the event')}</p>`),
  });
}

/** Tell the host, once per event, that people are being waitlisted because of their plan's cap. */
export async function notifyHostPlanLimit(eventId: string): Promise<boolean> {
  const claimed = await prisma.event.updateMany({ where: { id: eventId, planLimitNotifiedAt: null }, data: { planLimitNotifiedAt: new Date() } });
  if (!claimed.count) return false;
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { title: true, boostedAt: true, capacity: true, organizer: { select: { email: true, name: true, plan: true, planExpiresAt: true } } },
  });
  if (!ev?.organizer?.email || ev.organizer.email.endsWith('@udyaibase.com')) return false;
  const plan = effectiveHostPlan(ev.organizer);
  const cap = registrationLimit(plan, { boostedAt: ev.boostedAt, capacity: null });
  const canBoost = !ev.boostedAt && cap < EVENT_BOOST.registrationsPerEvent;
  sendEmailFireAndForget({
    to: ev.organizer.email,
    from: FROM,
    subject: `${ev.title} reached ${cap.toLocaleString('en-IN')} registrations`,
    type: 'organizer_plan_limit_reached',
    html: shell(`<h1 style="font-size:20px;margin:0 0 8px">New sign-ups are going to the waitlist</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(ev.organizer.name || 'there')}, <strong>${esc(ev.title)}</strong> reached ${cap.toLocaleString('en-IN')} registrations, the most your ${plan.name} plan includes per event. Everyone who registers now joins the waitlist.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${canBoost ? `Boost this event (${rupees(EVENT_BOOST.pricePaise)}, one time) for up to ${EVENT_BOOST.registrationsPerEvent.toLocaleString('en-IN')} registrations, or go Pro for ${HOST_PLANS.PRO.registrationsPerEvent.toLocaleString('en-IN')} per event.` : `Go Pro for up to ${HOST_PLANS.PRO.registrationsPerEvent.toLocaleString('en-IN')} registrations per event.`} People on the waitlist get the new spots automatically, in the order they signed up.</p>
<p style="margin:0">${button(`${SITE}/organizer/billing`, canBoost ? 'Boost or upgrade' : 'See plans')}</p>`),
  });
  return true;
}

/**
 * Fill spots that opened because the limit rose: earliest waitlisted first, each emailed their ticket.
 * Safe to call any time; does nothing when the event is still full. Returns how many were confirmed.
 */
export async function promoteWaitlist(eventId: string): Promise<number> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, endAt: true, approvalRequired: true, capacity: true, boostedAt: true, registrationCount: true, deletedAt: true, organizer: { select: { plan: true, planExpiresAt: true, email: true } } },
  });
  if (!ev || ev.deletedAt || ev.status !== 'PUBLISHED' || ev.endAt < new Date() || !ev.organizer) return 0;
  const open = registrationLimit(effectiveHostPlan(ev.organizer), ev) - ev.registrationCount;
  if (open <= 0) return 0;

  const promoted = await prisma.$queryRawUnsafe<{ guestName: string | null; guestEmail: string; qrToken: string }[]>(
    `UPDATE "EventRegistration" SET status = 'CONFIRMED', "waitlistReason" = NULL, "updatedAt" = NOW()
     WHERE id IN (
       SELECT id FROM "EventRegistration"
       WHERE "eventId" = $1 AND status = 'WAITLISTED' AND "deletedAt" IS NULL
       ORDER BY "registeredAt" ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING "guestName", "guestEmail", "qrToken"`,
    eventId, open,
  );
  // The limit went up, so tell the host again if they fill the new one too.
  await prisma.event.update({ where: { id: eventId }, data: { planLimitNotifiedAt: null } });
  for (const p of promoted) sendConfirmationEmail(eventId, p.guestEmail, p.guestName || 'there', p.qrToken).catch(() => {});
  if (promoted.length) {
    const e = await prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });
    if (e) refreshPaths([`/events/${e.slug}`]);
  }
  return promoted.length;
}

/** After a Pro upgrade: every upcoming event of the host. */
export async function promoteWaitlistsForOrganizer(organizerId: string): Promise<number> {
  const events = await prisma.event.findMany({
    where: { organizerId, deletedAt: null, status: 'PUBLISHED', endAt: { gt: new Date() }, registrations: { some: { status: 'WAITLISTED', deletedAt: null } } },
    select: { id: true },
  });
  let n = 0;
  for (const e of events) n += await promoteWaitlist(e.id);
  return n;
}

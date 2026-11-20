import { prisma, Prisma } from '@udyaibase/database';
import { createTicket } from '@/lib/support-tickets';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { effectivePlan } from '@/lib/employer/plans';
import { isRealInbox } from '@/lib/employer/owners';
import { addWorkingMinutes, replyPromise, SUPPORT_KINDS, WORKING_HOURS_TEXT, type SupportKind } from '@/lib/support/reply-times';

/**
 * An employer's "Report a problem": the ticket carries where they were (page, job, plan, browser) and the reply-time
 * promise for their plan. They get a confirmation with the promise; our team is alerted straight away when the promise
 * is 4 working hours (Scale, or urgent on a paid plan). Otherwise the 10:00 and 16:00 triage digest picks it up.
 */

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const ADMIN = () => (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.udyaibase.com').replace(/\/$/, '');
/** The address people can email (Resend receiving domain); replies to our support emails come back here. */
export const SUPPORT_INBOUND = () => (process.env.SUPPORT_INBOUND_ADDRESS || '').trim().toLowerCase();
export const SUPPORT_INBOX = () => process.env.SUPPORT_TRIAGE_EMAIL || process.env.ADMIN_DIGEST_EMAIL || 'admin@udyaibase.com';

export interface TicketContext { page?: string; jobId?: string; userAgent?: string }

function cleanContext(v: unknown, userAgent: string | null): TicketContext {
  const c = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const page = typeof c.page === 'string' && /^\/employer[\w\-/?=&.%]*$/.test(c.page) ? c.page.slice(0, 200) : undefined;
  const jobId = typeof c.jobId === 'string' && /^[a-z0-9]{20,30}$/.test(c.jobId) ? c.jobId : undefined;
  return { page, jobId, userAgent: userAgent?.slice(0, 200) || undefined };
}

export async function openEmployerTicket(opts: {
  employerId: string; email: string; name: string; kind: unknown; subject: string; description: string; context: unknown; userAgent: string | null; now?: Date;
  /** Opened by emailing support: the inbound email id (stops duplicates) and no page context. */
  viaEmail?: { externalId: string };
}) {
  const now = opts.now ?? new Date();
  const kind = SUPPORT_KINDS.find((k) => k.key === opts.kind) ?? SUPPORT_KINDS.find((k) => k.key === 'other')!;
  const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: opts.employerId }, select: { plan: true, planExpiresAt: true, companyName: true } });
  const plan = employer ? effectivePlan(employer).key : 'FREE';
  const promise = replyPromise(plan, kind.urgent);
  const due = addWorkingMinutes(now, promise.workingMinutes);
  const context = cleanContext(opts.context, opts.userAgent);
  if (context.jobId) {
    const own = await prisma.jobBoardListing.findFirst({ where: { id: context.jobId, employerId: opts.employerId }, select: { id: true } });
    if (!own) delete context.jobId;
  }

  const ticket = await createTicket({
    subject: opts.subject, description: opts.description, category: kind.category,
    priority: promise.workingMinutes <= 240 ? 'HIGH' : 'MEDIUM',
    portal: 'EMPLOYER', submitterType: 'EMPLOYER', submitterId: opts.employerId, submitterEmail: opts.email, submitterName: opts.name,
  });
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      context: { ...context, kind: kind.key, ...(opts.viaEmail ? { via: 'email' } : {}) } as Prisma.InputJsonValue, planAtOpen: plan, replyDueAt: due,
      ...(opts.viaEmail ? { externalId: opts.viaEmail.externalId } : {}),
    },
  });

  const when = due.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  if (isRealInbox(opts.email)) {
    sendEmailFireAndForget({
      to: opts.email, type: 'support_ticket_received', ...(SUPPORT_INBOUND() ? { replyTo: SUPPORT_INBOUND() } : {}),
      subject: `We got your message (${ticket.ticketNumber})`,
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">We got your message</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6"><strong>${esc(opts.subject)}</strong> (${esc(ticket.ticketNumber)})</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(promise.text)} ${promise.guaranteed ? `That’s by ${esc(when)} IST.` : ''} Our hours are ${esc(WORKING_HOURS_TEXT)}.</p>
<p style="margin:0 0 16px">${button(`${SITE()}/employer/support/${ticket.id}`, 'See your ticket')}</p>
${SUPPORT_INBOUND() ? '<p style="margin:0;font-size:13px;color:#6b7280">You can also just reply to this email.</p>' : ''}`),
    });
  }
  if (promise.workingMinutes <= 240) {
    sendEmailFireAndForget({
      to: SUPPORT_INBOX(), type: 'support_ticket_urgent',
      subject: `[4h] ${ticket.ticketNumber}: ${opts.subject}`.replace(/[\r\n]+/g, ' ').slice(0, 180),
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Reply due by ${esc(when)} IST</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6"><strong>${esc(employer?.companyName ?? opts.name)}</strong> (${esc(plan)}) · ${esc(kind.label)}</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(opts.description.slice(0, 1500))}</p>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280">Page: ${esc(context.page ?? '—')}</p>
<p style="margin:0">${button(`${ADMIN()}/support/${ticket.id}`, 'Open the ticket')}</p>`),
    });
  }
  return { ticket, promise, due };
}

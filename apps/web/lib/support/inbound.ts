import { prisma } from '@udyaibase/database';
import { getResend, sendEmail } from '@/lib/email/send';
import { esc, shell } from '@/lib/jobs/apply-emails';
import { openEmployerTicket, SUPPORT_INBOUND, SUPPORT_INBOX } from '@/lib/support/employer-tickets';

/**
 * Emails to the support address (Resend inbound, `email.received`) become tickets:
 * - a reply whose subject carries a ticket number (TKT-00042), from that ticket's person or their team, is added to it;
 * - otherwise, mail from someone on a hiring team opens a ticket for that workspace, with their plan's reply promise;
 * - mail from anyone else is forwarded to the support inbox (no automatic reply, so mail loops can't start).
 * Automatic replies (out of office, bounces) are ignored. Attachments aren't copied; the ticket says how many there were.
 */

export interface InboundEvent { email_id: string; from: string; to?: string[]; received_for?: string[]; subject?: string; attachments?: unknown[] }
export interface InboundEmail { text: string | null; html: string | null; headers: Record<string, string> | null }
export type InboundResult = 'ignored' | 'duplicate' | 'reply' | 'ticket' | 'forwarded';

export function parseAddress(v: string): { email: string; name: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : v).trim().toLowerCase();
  const name = (m?.[1] || email.split('@')[0]).trim().slice(0, 120);
  return { email, name };
}

/** The new part of a reply: everything above the quoted earlier message. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .{4,200}wrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^_{5,}$/.test(line) || /^From:\s.+/.test(line) && out.length > 0) break;
    if (/^>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}

export function htmlToText(html: string): string {
  return html.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

async function fetchEmail(id: string): Promise<InboundEmail | null> {
  const r = await getResend()?.emails.receiving.get(id);
  if (!r?.data) return null;
  return { text: r.data.text, html: r.data.html, headers: r.data.headers };
}

export async function handleInboundEmail(ev: InboundEvent, load: (id: string) => Promise<InboundEmail | null> = fetchEmail): Promise<InboundResult> {
  const inbound = SUPPORT_INBOUND();
  const recipients = [...(ev.to ?? []), ...(ev.received_for ?? [])].map((a) => parseAddress(String(a)).email);
  if (!inbound || !recipients.includes(inbound)) return 'ignored';
  const [t, m] = await Promise.all([
    prisma.supportTicket.findUnique({ where: { externalId: ev.email_id }, select: { id: true } }),
    prisma.supportTicketMessage.findUnique({ where: { externalId: ev.email_id }, select: { id: true } }),
  ]);
  if (t || m) return 'duplicate';

  const from = parseAddress(ev.from);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from.email) || from.email === inbound || /^(mailer-daemon|postmaster|no-?reply)@/.test(from.email)) return 'ignored';
  const mail = await load(ev.email_id);
  if (!mail) throw new Error('inbound email not found');
  const h = Object.fromEntries(Object.entries(mail.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if ((h['auto-submitted'] && h['auto-submitted'] !== 'no') || h['x-autoreply'] || h['x-autorespond'] || /bulk|junk|list/i.test(h['precedence'] ?? '')) return 'ignored';

  const subject = (ev.subject || '(no subject)').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const files = ev.attachments?.length ?? 0;
  const raw = mail.text?.trim() ? mail.text : htmlToText(mail.html ?? '');
  const body = `${stripQuoted(raw) || '(empty message)'}${files ? `\n\n[${files} attachment${files === 1 ? '' : 's'} not copied. Ask them to share it another way if needed.]` : ''}`;

  // A reply to an existing ticket.
  const number = subject.match(/\bTKT-\d{5,}\b/i)?.[0].toUpperCase();
  if (number) {
    const ticket = await prisma.supportTicket.findUnique({ where: { ticketNumber: number }, select: { id: true, status: true, portal: true, submitterEmail: true, submitterId: true } });
    const sameTeam = ticket?.portal === 'EMPLOYER'
      && !!(await prisma.jobBoardTeamMember.findFirst({ where: { employerId: ticket.submitterId, email: from.email, status: 'ACTIVE' }, select: { id: true } }));
    if (ticket && (ticket.submitterEmail.toLowerCase() === from.email || sameTeam)) {
      await prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, senderType: 'USER', senderId: ticket.submitterId, senderName: from.name, body, isInternal: false, externalId: ev.email_id } });
      if (ticket.status === 'RESOLVED' || ticket.status === 'AWAITING_USER' || ticket.status === 'CLOSED') {
        await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } });
      }
      return 'reply';
    }
  }

  // Someone on a hiring team: a new ticket for their workspace (the one they used most recently).
  const member = await prisma.jobBoardTeamMember.findFirst({
    where: { email: from.email, status: 'ACTIVE', Employer: { isActive: true, deletedAt: null } },
    orderBy: { lastActiveAt: { sort: 'desc', nulls: 'last' } },
    select: { employerId: true, name: true },
  });
  if (member) {
    const description = body.length >= 10 ? body : `${body}\n\n(sent by email)`;
    await openEmployerTicket({
      employerId: member.employerId, email: from.email, name: member.name || from.name, kind: 'other',
      subject: subject.length >= 3 ? subject : 'Email to support', description, context: {}, userAgent: null, viaEmail: { externalId: ev.email_id },
    });
    return 'ticket';
  }

  // Anyone else: hand it to the team as it is.
  await sendEmail({
    to: SUPPORT_INBOX(), replyTo: from.email, type: 'support_inbound_forward',
    subject: `Fwd (not a customer): ${subject}`.slice(0, 180),
    html: shell(`<p style="margin:0 0 12px;font-size:14px;color:#6b7280">From ${esc(from.name)} &lt;${esc(from.email)}&gt;, who isn’t on any hiring team. Reply to this email to answer them directly.</p>
<p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(body)}</p>`),
  });
  return 'forwarded';
}

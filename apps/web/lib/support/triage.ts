import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { dueText } from '@/lib/support/reply-times';
import { SUPPORT_INBOX } from '@/lib/support/employer-tickets';

const ADMIN = () => (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.udyaibase.com').replace(/\/$/, '');

/**
 * The support triage digest, Mon–Sat at 10:00 and 16:00 IST: every open ticket still waiting for our first reply,
 * overdue first, then by due time, plus tickets waiting on us after the person wrote back. Sent only when there's
 * something to do.
 */
export async function sendTriageDigest(now = new Date()): Promise<{ sent: boolean; waiting: number }> {
  const [firstReply, followUps] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { firstReplyAt: null, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: [{ replyDueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 60,
      select: { id: true, ticketNumber: true, subject: true, portal: true, planAtOpen: true, replyDueAt: true, createdAt: true, submitterName: true, category: true },
    }),
    // They replied and it's our turn (status moves back to OPEN or IN_PROGRESS when the person writes).
    prisma.supportTicket.count({ where: { firstReplyAt: { not: null }, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ]);
  if (!firstReply.length && !followUps) return { sent: false, waiting: 0 };

  const rows = firstReply.map((t) => {
    const due = t.replyDueAt ? dueText(t.replyDueAt, now) : { text: 'no promise', overdue: false };
    return `<tr>
<td style="padding:6px 8px;border-top:1px solid #f3f4f6;font-size:13px;white-space:nowrap;${due.overdue ? 'color:#b91c1c;font-weight:600' : ''}">${esc(due.text)}</td>
<td style="padding:6px 8px;border-top:1px solid #f3f4f6;font-size:13px"><a href="${ADMIN()}/support/${t.id}" style="color:#111827">${esc(t.ticketNumber)} · ${esc(t.subject.slice(0, 90))}</a><br><span style="color:#6b7280">${esc(t.submitterName)} · ${esc(t.portal)}${t.planAtOpen ? ` · ${esc(t.planAtOpen)}` : ''} · ${esc(t.category)}</span></td>
</tr>`;
  }).join('');
  const overdue = firstReply.filter((t) => t.replyDueAt && t.replyDueAt < now).length;
  const when = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  await sendEmail({
    to: SUPPORT_INBOX(), type: 'support_triage_digest',
    subject: `Support triage ${when}: ${firstReply.length} waiting for a first reply${overdue ? `, ${overdue} overdue` : ''}`,
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Support triage</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${firstReply.length} ticket${firstReply.length === 1 ? '' : 's'} waiting for a first reply${overdue ? ` (<strong style="color:#b91c1c">${overdue} overdue</strong>)` : ''}. ${followUps} waiting on us after the person wrote back. Technical ones go to the developer; reply to the rest.</p>
${rows ? `<table style="width:100%;border-collapse:collapse;margin:0 0 20px">${rows}</table>` : ''}
<p style="margin:0">${button(`${ADMIN()}/support`, 'Open the support queue')}</p>`),
  });
  return { sent: true, waiting: firstReply.length };
}

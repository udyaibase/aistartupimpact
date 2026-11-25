import { prisma } from '@udyaibase/database';
import { notifyEmployer } from '@/lib/employer/notify';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { STATUS_LABEL } from '@/lib/employer/stages';

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

/**
 * On hold keeps the stage, step and owner, and pauses reminders. When the come-back date arrives it becomes a task
 * for the job's owner: one email listing who is back today. Nobody moves and nobody is contacted automatically;
 * the owner resumes them or gets in touch.
 */
export async function holdReturns(now = new Date()): Promise<number> {
  const rows = await prisma.jobBoardApplication.findMany({
    where: { status: 'ON_HOLD', withdrawnAt: null, onHoldUntil: { gt: new Date(now.getTime() - 864e5), lte: now } },
    select: { id: true, fullName: true, holdFromStatus: true, listingId: true, Listing: { select: { employerId: true, title: true, publishedByEmail: true, Employer: { select: { email: true } } } } },
    take: 500,
  });
  const byOwner = new Map<string, typeof rows>();
  for (const r of rows) {
    const to = r.Listing.publishedByEmail || r.Listing.Employer.email;
    if (!to || to.endsWith('.invalid')) continue;
    byOwner.set(to, [...(byOwner.get(to) ?? []), r]);
  }
  for (const [to, list] of byOwner) {
    const perWorkspace = new Map<string, number>();
    for (const r of list) perWorkspace.set(r.Listing.employerId, (perWorkspace.get(r.Listing.employerId) ?? 0) + 1);
    for (const [employerId, n] of perWorkspace) {
      await notifyEmployer(employerId, { type: 'hold_returns', title: `${n} ${n === 1 ? 'candidate is' : 'candidates are'} back from On hold`, message: 'They’re back in the stage they were in before.', link: '/employer/applications' }, { email: to });
    }
    const items = list.slice(0, 25).map((r) => `<li style="margin:0 0 6px"><a href="${SITE()}/employer/applications?job=${r.listingId}&candidate=${r.id}" style="color:#111827;font-weight:600">${esc(r.fullName)}</a> · ${esc(r.Listing.title)}${r.holdFromStatus ? ` · was in ${esc(STATUS_LABEL[r.holdFromStatus] ?? r.holdFromStatus)}` : ''}</li>`).join('');
    sendEmailFireAndForget({
      to, type: 'hold_returns',
      subject: `${list.length} candidate${list.length === 1 ? ' is' : 's are'} back from On hold today`,
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Back from On hold today</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">You asked to come back to these candidates today. Resume them where they were, or get in touch.</p>
<ul style="margin:0 0 20px;padding-left:18px;font-size:15px;line-height:1.5">${items}</ul>
<p style="margin:0">${button(`${SITE()}/employer/applications?stage=onhold`, 'Open On hold')}</p>`),
    });
  }
  return rows.length;
}

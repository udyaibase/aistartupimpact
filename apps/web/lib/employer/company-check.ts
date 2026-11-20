import { prisma } from '@udyaibase/database';
import { sendEmail, sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { isFreeMailDomain, emailDomain, isClaimVerified } from '@/lib/jobs/trust';
import { isRealInbox } from '@/lib/employer/owners';
import { markStep } from '@/lib/employer/onboarding';
import { publishWaiting } from '@/lib/employer/publish';

/**
 * Two ways a workspace whose startup isn't founder-verified gets its jobs live:
 * 1. "Send to your founder": we email the founder a link to verify the startup (one reminder after 24 hours). When they
 *    open hiring, waiting jobs go live by themselves (see openFounderWorkspace).
 * 2. The company check: someone with a work email on the company's domain presses Publish; our team checks the
 *    website, LinkedIn and MCA record the same working day. Passing allows 2 live jobs ("Email verified" label).
 */

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const ADMIN = () => (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.udyaibase.com').replace(/\/$/, '');
const ADMIN_INBOX = () => process.env.ADMIN_DIGEST_EMAIL || 'admin@udyaibase.com';
const DAY = 864e5;

/** MCA company number: CIN (21 characters, e.g. U72900KA2021PTC123456) or LLPIN (AAA-1234). */
export function cleanCin(v: unknown): string | null | 'invalid' {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return 'invalid';
  const c = v.trim().toUpperCase().replace(/\s+/g, '');
  if (/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(c) || /^[A-Z]{3}-\d{4}$/.test(c)) return c;
  return 'invalid';
}

/** The first publish from a workspace that qualifies for the check: mark it pending and tell our team. */
export async function requestCompanyReview(employerId: string, memberEmail: string, now = new Date()) {
  const r = await prisma.jobBoardEmployer.updateMany({
    where: { id: employerId, companyReview: null },
    data: { companyReview: 'PENDING', companyReviewRequestedAt: now, companyReviewRequestedBy: memberEmail },
  });
  if (!r.count) return;
  await markStep(employerId, 'REVIEW_REQUESTED');
  const e = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { companyName: true, websiteUrl: true, linkedinUrl: true, companyCin: true } });
  if (!e) return;
  sendEmailFireAndForget({
    to: ADMIN_INBOX(), type: 'admin_company_check',
    subject: `Company check: ${e.companyName}`.replace(/[\r\n]+/g, ' '),
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">A company is waiting for its check</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6"><strong>${esc(e.companyName)}</strong> pressed Publish. Check the website, LinkedIn and MCA record today (Mon–Sat).</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.7">Website: ${esc(e.websiteUrl ?? '—')}<br>LinkedIn: ${esc(e.linkedinUrl ?? '—')}<br>CIN/LLPIN: ${esc(e.companyCin ?? '—')}<br>Asked by: ${esc(memberEmail)}</p>
<p style="margin:0">${button(`${ADMIN()}/employers?review=pending`, 'Open the check')}</p>`),
  });
}

/** Our team's decision (from the admin app). Passing publishes the waiting jobs; failing tells the team why. */
export async function decideCompanyReview(opts: { employerId: string; approve: boolean; note: string | null; reviewer: string; now?: Date }):
  Promise<{ ok: true; published: number } | { ok: false; error: string }> {
  const now = opts.now ?? new Date();
  const note = opts.note?.trim().replace(/\s+/g, ' ').slice(0, 300) || null;
  if (!opts.approve && !note) return { ok: false, error: 'Add a short reason the team will see.' };
  const e = await prisma.jobBoardEmployer.findUnique({ where: { id: opts.employerId }, select: { id: true, companyName: true, companyReviewRequestedBy: true, email: true } });
  if (!e) return { ok: false, error: 'Workspace not found.' };
  await prisma.jobBoardEmployer.update({
    where: { id: e.id },
    data: { companyReview: opts.approve ? 'APPROVED' : 'REJECTED', companyReviewedAt: now, companyReviewedBy: opts.reviewer.slice(0, 120), companyReviewNote: note },
  });
  await markStep(e.id, 'REVIEW_DECIDED', { approved: opts.approve });
  if (opts.approve) {
    const r = await publishWaiting(e.id, now);
    return { ok: true, published: r.published.length };
  }
  await prisma.jobBoardListing.updateMany({ where: { employerId: e.id, publishWaitingAt: { not: null } }, data: { publishWaitingAt: null, publishWaitingBy: null } });
  const to = e.companyReviewRequestedBy || e.email;
  if (isRealInbox(to)) {
    sendEmailFireAndForget({
      to, type: 'employer_company_check_failed',
      subject: `We couldn’t confirm ${e.companyName} yet`.replace(/[\r\n]+/g, ' '),
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">We couldn’t confirm your company yet</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(note ?? '')}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Your jobs are saved as drafts. The quickest way through is to ask your founder to verify the startup on Udyaibase; your jobs can then go live. Reply to this email if you think we got it wrong.</p>
<p style="margin:0">${button(`${SITE()}/employer/company`, 'Ask your founder')}</p>`),
    });
  }
  return { ok: true, published: 0 };
}

function founderEmailHtml(o: { company: string; asker: string; link: string; reminder: boolean }) {
  return shell(`
<h1 style="font-size:20px;margin:0 0 8px">${o.reminder ? 'Reminder: ' : ''}${esc(o.asker)} is waiting to publish jobs for ${esc(o.company)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(o.asker)} set up hiring for <strong>${esc(o.company)}</strong> on Udyaibase. Jobs only go live for startups their founder has verified, so their jobs are waiting for you.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Verify the startup and open hiring (a few minutes). The waiting jobs then go live by themselves, and you become an owner of the hiring workspace.</p>
<p style="margin:0 0 24px">${button(o.link, 'Verify and open hiring')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">Not your company, or don’t know ${esc(o.asker)}? Ignore this email; nothing is published without you.</p>`);
}

/** "Send to your founder": emails them the verify link now (at most once every 12 hours). */
export async function askFounder(opts: { employerId: string; memberEmail: string; founderEmail: string; now?: Date }):
  Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = opts.now ?? new Date();
  const to = opts.founderEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || to.length > 254) return { ok: false, error: 'Enter your founder’s email address.', status: 400 };
  if (to === opts.memberEmail.toLowerCase()) return { ok: false, error: 'Enter your founder’s email, not your own.', status: 400 };
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: opts.employerId },
    select: { companyName: true, startupId: true, startupClaimMethod: true, founderAskedAt: true, Startup: { select: { name: true, slug: true, isVerified: true } } },
  });
  if (!e) return { ok: false, error: 'Workspace not found.', status: 404 };
  if (isClaimVerified(e) && e.Startup?.isVerified) return { ok: false, error: 'Your startup is already verified.', status: 409 };
  if (!e.Startup) return { ok: false, error: 'Choose your startup on the Company page first.', status: 400 };
  if (e.founderAskedAt && now.getTime() - e.founderAskedAt.getTime() < DAY / 2) return { ok: false, error: 'We emailed your founder recently. Give them a little time, or send them the link yourself.', status: 429 };

  await sendEmail({
    to, replyTo: opts.memberEmail, type: 'employer_founder_ask',
    subject: `Verify ${e.Startup.name} so your team’s jobs can go live`.replace(/[\r\n]+/g, ' '),
    html: founderEmailHtml({ company: e.Startup.name, asker: opts.memberEmail, link: `${SITE()}/startups/claim/${e.Startup.slug}`, reminder: false }),
  });
  await prisma.jobBoardEmployer.update({ where: { id: opts.employerId }, data: { founderAskEmail: to, founderAskedAt: now, founderAskRemindedAt: null } });
  await markStep(opts.employerId, 'FOUNDER_ASKED', { founderDomainIsFree: isFreeMailDomain(emailDomain(to) ?? '') });
  return { ok: true };
}

/** Daily: one reminder to founders asked more than 24 hours ago whose startup still isn't verified for hiring. */
export async function remindFounders(now = new Date()): Promise<number> {
  const rows = await prisma.jobBoardEmployer.findMany({
    where: {
      founderAskEmail: { not: null }, founderAskRemindedAt: null,
      founderAskedAt: { lte: new Date(now.getTime() - DAY), gte: new Date(now.getTime() - 7 * DAY) },
      deletedAt: null, isActive: true,
    },
    select: { id: true, founderAskEmail: true, founderAskedAt: true, startupId: true, startupClaimMethod: true, Startup: { select: { name: true, slug: true, isVerified: true } } },
    take: 200,
  });
  let sent = 0;
  for (const e of rows) {
    // Mark first so a crash can't send twice.
    await prisma.jobBoardEmployer.update({ where: { id: e.id }, data: { founderAskRemindedAt: now } });
    if (!e.Startup || (isClaimVerified(e) && e.Startup.isVerified)) continue;
    const member = await prisma.jobBoardTeamMember.findFirst({ where: { employerId: e.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { email: true } });
    const asker = member?.email ?? 'Your team';
    const r = await sendEmail({
      to: e.founderAskEmail!, type: 'employer_founder_ask_reminder', ...(asker.includes('@') ? { replyTo: asker } : {}),
      subject: `Reminder: verify ${e.Startup.name} so your team’s jobs can go live`.replace(/[\r\n]+/g, ' '),
      html: founderEmailHtml({ company: e.Startup.name, asker, link: `${SITE()}/startups/claim/${e.Startup.slug}`, reminder: true }),
    });
    if (r?.success !== false) sent++;
  }
  return sent;
}

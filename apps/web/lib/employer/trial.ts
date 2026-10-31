import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { PLANS, TRIAL_AI_SCREENS, TRIAL_DAYS, planFeaturedUntil } from '@/lib/employer/plans';

/**
 * Free 7-day Featured trial, started automatically by a workspace's first published job. No card needed.
 * One per workspace, and one per verified startup and per verified company domain, so new accounts for the
 * same company don't get another. Udyaibase's own (admin-run) workspaces never get one.
 * Returns the trial end when one was started.
 */
export async function maybeStartTrial(employerId: string, now = new Date()): Promise<Date | null> {
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: employerId },
    select: { id: true, email: true, plan: true, planExpiresAt: true, trialStartedAt: true, startupId: true, verifiedCompanyDomain: true, passwordHash: true },
  });
  if (!e || e.trialStartedAt || e.email.toLowerCase().endsWith('@udyaibase.com')) return null;
  if (e.plan !== 'FREE' && e.planExpiresAt && e.planExpiresAt > now) return null; // already paid

  const sameCompany = [
    ...(e.startupId ? [{ startupId: e.startupId }] : []),
    ...(e.verifiedCompanyDomain ? [{ verifiedCompanyDomain: e.verifiedCompanyDomain }] : []),
  ];
  if (sameCompany.length) {
    const used = await prisma.jobBoardEmployer.findFirst({ where: { id: { not: e.id }, trialStartedAt: { not: null }, OR: sameCompany }, select: { id: true } });
    if (used) return null;
  }

  const end = new Date(now.getTime() + TRIAL_DAYS * 864e5);
  // Claim atomically so two publishes at once can't both start it.
  const claimed = await prisma.jobBoardEmployer.updateMany({
    where: { id: e.id, trialStartedAt: null },
    data: { plan: 'FEATURED', planExpiresAt: end, planIsTrial: true, trialStartedAt: now, maxActiveJobs: PLANS.FEATURED.maxActiveJobs, planReminderSentAt: null, planGraceNoticeAt: null },
  });
  if (!claimed.count) return null;
  await prisma.jobBoardListing.updateMany({
    where: { employerId: e.id, status: 'OPEN', deletedAt: null },
    data: { isFeatured: true, featuredUntil: planFeaturedUntil({ plan: 'FEATURED', planExpiresAt: end, planIsTrial: true }) },
  });

  if (e.passwordHash !== '') {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
    const date = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
    sendEmailFireAndForget({
      to: e.email,
      subject: `Your job is live, with a free ${TRIAL_DAYS}-day Featured trial`,
      type: 'employer_trial_started',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your job is live, and featured for free</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">To help your first hire, you get the Featured plan free until <strong>${esc(date)}</strong>:</p>
<ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7">
<li>Featured badge and higher placement on Udyaibase AI Jobs</li>
<li>Up to ${PLANS.FEATURED.maxActiveJobs} open jobs</li>
<li>AI review for up to ${TRIAL_AI_SCREENS} candidates</li>
</ul>
<p style="margin:0 0 24px">${button(`${site}/employer/dashboard`, 'Go to your dashboard')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">No card needed and nothing is charged. When the trial ends you move to Free unless you choose a plan.</p>`),
    });
  }
  return end;
}

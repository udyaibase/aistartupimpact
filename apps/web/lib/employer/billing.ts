import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { calendarMonthStart, cycleDays, effectivePlan, GRACE_DAYS, periodStart, planDef, planFeaturedUntil, planKeyOf, planPhase, PLANS, TRIAL_AI_SCREENS, TRIAL_PLAN } from '@/lib/employer/plans';
import { emailInvoice } from '@/lib/billing/invoice';
import { setListingStatus } from '@/lib/jobs/listing-status';

/**
 * Plan in force plus AI usage for the current period. During the grace days after a paid plan ends, everything
 * keeps working except new AI reviews (existing results stay visible); a trial includes a smaller AI allowance.
 * Free's allowance resets on the 1st of each month; paid plans' every 30 days from the plan end.
 */
export async function planStatus(employerId: string) {
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: employerId },
    select: { plan: true, planExpiresAt: true, planIsTrial: true, trialStartedAt: true, aiAutoScreen: true, planCycle: true },
  });
  if (!e) return null;
  const plan = effectivePlan(e);
  const { phase, endsAt, graceEndsAt } = planPhase(e);
  const since = plan.key === 'FREE' ? calendarMonthStart() : phase === 'trial' ? e.trialStartedAt : periodStart(e.planExpiresAt);
  const used = since
    ? await prisma.jobBoardAiScreening.count({ where: { employerId, billable: true, createdAt: { gte: since } } })
    : 0;
  const limit = phase === 'grace' ? 0 : phase === 'trial' ? Math.min(TRIAL_AI_SCREENS, plan.aiScreensPerPeriod) : plan.aiScreensPerPeriod;
  return {
    plan,
    phase,
    expiresAt: plan.key === 'FREE' ? null : e.planExpiresAt,
    cycle: e.planCycle,
    graceEndsAt: phase === 'grace' ? graceEndsAt : null,
    trialEndsAt: phase === 'trial' ? endsAt : null,
    aiAutoScreen: e.aiAutoScreen,
    ai: { used, limit, left: Math.max(0, limit - used) },
  };
}

export { checkoutSignatureValid, webhookSignatureValid } from '@/lib/billing/razorpay';

/**
 * Mark an order paid and start (or extend) the plan. Idempotent: the checkout callback and the
 * webhook may both arrive; only the first flips PENDING → SUCCESS. Renewing the same plan early
 * adds the period (30 or 365 days) to the current end; switching plan starts a fresh period now.
 * The first annual purchase at the founding price makes the workspace a founding member.
 */
export async function activatePayment(orderId: string, paymentId: string): Promise<'activated' | 'already' | 'unknown'> {
  let paidId: string | null = null;
  const result = await prisma.$transaction(async (tx) => {
    const pay = await tx.jobBoardPayment.findUnique({ where: { razorpayOrderId: orderId } });
    if (!pay) return 'unknown';
    const flipped = await tx.jobBoardPayment.updateMany({
      where: { id: pay.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUCCESS', razorpayPaymentId: paymentId, paidAt: new Date() },
    });
    if (!flipped.count) return 'already';

    const emp = await tx.jobBoardEmployer.findUniqueOrThrow({ where: { id: pay.employerId }, select: { plan: true, planExpiresAt: true, planIsTrial: true, foundingMemberAt: true } });
    const now = Date.now();
    const current = effectivePlan(emp, now);
    const key = planKeyOf(pay.plan);
    // Same plan (including a running trial of it): the paid period starts when the current one ends.
    const base = current.key === key && emp.planExpiresAt ? Math.max(now, emp.planExpiresAt.getTime()) : now;
    const end = new Date(base + cycleDays(pay.cycle) * 864e5);
    const def = planDef(pay.plan);

    await tx.jobBoardEmployer.update({
      where: { id: pay.employerId },
      data: {
        plan: pay.plan, planCycle: pay.cycle, planExpiresAt: end, planIsTrial: false, maxActiveJobs: def.maxActiveJobs,
        planReminderSentAt: null, planGraceNoticeAt: null,
        ...(pay.foundingPrice && !emp.foundingMemberAt ? { foundingMemberAt: new Date(now) } : {}),
      },
    });
    await tx.jobBoardPayment.update({ where: { id: pay.id }, data: { periodStart: new Date(base), periodEnd: end } });
    if (def.featured) {
      await tx.jobBoardListing.updateMany({
        where: { employerId: pay.employerId, status: 'OPEN', deletedAt: null },
        data: { isFeatured: true, featuredUntil: planFeaturedUntil({ plan: pay.plan, planExpiresAt: end }) },
      });
    }
    paidId = pay.id;
    return 'activated' as const;
  });
  // Invoice (number, frozen bill-to, email) after the payment is committed; a failure here never undoes it,
  // and the daily cron retries anything not yet emailed.
  const id = paidId as string | null;
  if (result === 'activated' && id) await emailInvoice('employer', id).catch((e) => console.error('[invoice] employer', e));
  return result;
}

/** Featured placement for a job being published now, if the plan includes it. */
export async function featuredFor(employerId: string): Promise<{ isFeatured: boolean; featuredUntil: Date | null }> {
  const e = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { plan: true, planExpiresAt: true, planIsTrial: true } });
  const plan = e ? effectivePlan(e) : PLANS.FREE;
  return plan.featured ? { isFeatured: true, featuredUntil: planFeaturedUntil(e!) } : { isFeatured: false, featuredUntil: null };
}

/**
 * Daily (from the data-retention cron), per workspace:
 * - 3 days before a paid plan ends (2 before a trial ends): a reminder.
 * - On the day a paid plan ends: "renew within 3 days" (grace; everything keeps working but new AI reviews).
 * - When grace (or a trial) is over: back to Free. Open jobs above the Free limit are paused, never deleted:
 *   the most recently published stay open and the owner is emailed which were paused.
 * Featured placement stops on its own date (plan end, plus grace for paid plans).
 */
export async function runPlanMaintenance(now = new Date(), opts: { onlyEmployerId?: string } = {}) {
  const only = opts.onlyEmployerId ? { id: opts.onlyEmployerId } : {};
  const hasInbox = { passwordHash: { not: '' }, deletedAt: null };
  const DAY = 864e5;

  const due = await prisma.jobBoardEmployer.findMany({
    where: {
      plan: { not: 'FREE' }, planReminderSentAt: null, ...hasInbox, ...only,
      OR: [
        { planIsTrial: false, planExpiresAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY) } },
        { planIsTrial: true, planExpiresAt: { gt: now, lte: new Date(now.getTime() + 2 * DAY) } },
      ],
    },
    select: { id: true, email: true, plan: true, planExpiresAt: true, planIsTrial: true },
    take: 500,
  });
  for (const e of due) {
    if (e.planIsTrial) sendTrialEndingEmail(e.email, e.planExpiresAt!);
    else sendPlanEndingEmail(e.email, planDef(e.plan).name, e.planExpiresAt!);
    await prisma.jobBoardEmployer.update({ where: { id: e.id }, data: { planReminderSentAt: now } });
  }

  const ended = await prisma.jobBoardEmployer.findMany({
    where: { plan: { not: 'FREE' }, planIsTrial: false, planGraceNoticeAt: null, planExpiresAt: { lte: now, gt: new Date(now.getTime() - GRACE_DAYS * DAY) }, ...hasInbox, ...only },
    select: { id: true, email: true, plan: true, planExpiresAt: true },
    take: 500,
  });
  for (const e of ended) {
    sendGraceEmail(e.email, planDef(e.plan).name, new Date(e.planExpiresAt!.getTime() + GRACE_DAYS * DAY));
    await prisma.jobBoardEmployer.update({ where: { id: e.id }, data: { planGraceNoticeAt: now } });
  }

  const lapsing = await prisma.jobBoardEmployer.findMany({
    where: {
      plan: { not: 'FREE' }, ...only,
      OR: [{ planIsTrial: true, planExpiresAt: { lte: now } }, { planIsTrial: false, planExpiresAt: { lte: new Date(now.getTime() - GRACE_DAYS * DAY) } }],
    },
    select: { id: true, email: true, plan: true, planIsTrial: true, passwordHash: true, foundingMemberAt: true, foundingLostAt: true },
    take: 500,
  });
  let jobsPaused = 0;
  for (const e of lapsing) {
    // A lapse to Free ends founding pricing for good (it holds only while the subscription is unbroken).
    const loseFounding = !e.planIsTrial && e.foundingMemberAt && !e.foundingLostAt ? { foundingLostAt: now } : {};
    await prisma.jobBoardEmployer.update({ where: { id: e.id }, data: { plan: 'FREE', planIsTrial: false, maxActiveJobs: PLANS.FREE.maxActiveJobs, ...loseFounding } });
    const open = await prisma.jobBoardListing.findMany({
      where: { employerId: e.id, status: 'OPEN', deletedAt: null },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, title: true },
    });
    const extra = open.slice(PLANS.FREE.maxActiveJobs);
    for (const j of extra) await setListingStatus(j.id, 'PAUSED');
    jobsPaused += extra.length;
    if (e.passwordHash !== '') sendMovedToFreeEmail(e.email, e.planIsTrial ? `${PLANS[TRIAL_PLAN].name} trial` : `${planDef(e.plan).name} plan`, open.slice(0, PLANS.FREE.maxActiveJobs), extra);
  }

  const unfeatured = await prisma.jobBoardListing.updateMany({
    where: { isFeatured: true, featuredUntil: { lte: now }, ...(opts.onlyEmployerId ? { employerId: opts.onlyEmployerId } : {}) },
    data: { isFeatured: false },
  });
  return { planRemindersSent: due.length, graceNoticesSent: ended.length, plansLapsed: lapsing.length, jobsPaused, listingsUnfeatured: unfeatured.count };
}

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const longDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

function sendTrialEndingEmail(to: string, endsAt: Date) {
  sendEmailFireAndForget({
    to,
    subject: `Your ${PLANS[TRIAL_PLAN].name} trial ends on ${longDate(endsAt)}`,
    type: 'employer_trial_ending',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your ${PLANS[TRIAL_PLAN].name} trial ends on ${esc(longDate(endsAt))}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Keep your jobs featured, up to ${PLANS[TRIAL_PLAN].maxActiveJobs} open roles and ${PLANS[TRIAL_PLAN].aiScreensPerPeriod.toLocaleString('en-IN')} AI reviews a month with ${PLANS[TRIAL_PLAN].name}, or pick Growth from ${'₹'}${(PLANS.GROWTH.pricePaise / 100).toLocaleString('en-IN')} a month. If you don’t choose a plan, you move to Free: 1 open job and ${PLANS.FREE.aiScreensPerPeriod} AI reviews a month, and your candidates stay.</p>
<p style="margin:0 0 24px">${button(`${SITE()}/employer/billing`, 'Choose a plan')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">No card was taken for the trial, so nothing is charged unless you pay.</p>`),
  });
}

function sendGraceEmail(to: string, planName: string, graceEndsAt: Date) {
  sendEmailFireAndForget({
    to,
    subject: `Your ${planName} plan has ended: renew by ${longDate(graceEndsAt)}`,
    type: 'employer_plan_grace',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your ${esc(planName)} plan has ended</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Your open jobs, featured placement and website widget keep working until <strong>${esc(longDate(graceEndsAt))}</strong>. New AI reviews are paused; past reviews stay visible. Renew before then to carry on without any change.</p>
<p style="margin:0 0 24px">${button(`${SITE()}/employer/billing`, 'Renew now')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">After that you move to Free. Nothing is deleted.</p>`),
  });
}

function sendMovedToFreeEmail(to: string, what: string, kept: { title: string }[], paused: { id: string; title: string }[]) {
  const list = (items: { title: string }[]) => `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.7">${items.map((j) => `<li>${esc(j.title)}</li>`).join('')}</ul>`;
  sendEmailFireAndForget({
    to,
    subject: `Your ${what} has ended: you're on Free`,
    type: 'employer_moved_to_free',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">You’re on the Free plan</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Your ${esc(what)} has ended. Your candidates, notes and past AI reviews are all still here.</p>
${paused.length ? `<p style="margin:0 0 6px;font-size:15px">Free includes ${PLANS.FREE.maxActiveJobs} open job, so we kept your most recent one open:</p>${list(kept)}<p style="margin:0 0 6px;font-size:15px">These are paused (not deleted). Pause the open one and resume another any time, or upgrade to reopen them all:</p>${list(paused)}` : ''}
<p style="margin:0 0 24px">${button(`${SITE()}/employer/billing`, 'See plans')}</p>`),
  });
}

function sendPlanEndingEmail(to: string, planName: string, endsAt: Date) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  const date = endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  sendEmailFireAndForget({
    to,
    subject: `Your ${planName} plan ends on ${date}`,
    type: 'employer_plan_ending',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your ${esc(planName)} plan ends on ${esc(date)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">If you don’t renew, everything keeps working for ${GRACE_DAYS} more days (except new AI reviews), then you move to the Free plan with 1 open job. Your candidates and past AI reviews always stay.</p>
<p style="margin:0 0 24px">${button(`${site}/employer/billing`, 'Renew plan')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">Plans never renew automatically, so nothing is charged unless you pay.</p>`),
  });
}

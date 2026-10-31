import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { effectiveHostPlan, HOST_GRACE_DAYS, HOST_PERIOD_DAYS, HOST_PLANS, hostPeriodStart, hostPlanPhase, isPlatformOrganizer } from '@/lib/events/plans';
import { promoteWaitlist, promoteWaitlistsForOrganizer } from '@/lib/events/waitlist';
import { emailInvoice } from '@/lib/billing/invoice';

/** Upcoming = published and not yet ended. */
export const upcomingWhere = (organizerId: string, now = new Date()) => ({
  organizerId, status: 'PUBLISHED' as const, deletedAt: null, endAt: { gt: now },
});

export async function hostPlanStatus(organizerId: string) {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
  if (!o) return null;
  const plan = effectiveHostPlan(o);
  const { phase, graceEndsAt } = hostPlanPhase(o);
  const since = plan.key === 'PRO' ? hostPeriodStart(o.planExpiresAt) : null;
  const [upcoming, team, promoUsed] = await Promise.all([
    prisma.event.count({ where: upcomingWhere(organizerId) }),
    prisma.eventTeamMember.count({ where: { organizerId, status: { in: ['ACTIVE', 'PENDING'] } } }),
    since ? prisma.eventEmailCampaign.count({ where: { organizerId, creditSource: 'PLAN', status: { not: 'FAILED' }, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  // Grace days after Pro ends: everything keeps working except new promo emails.
  const promoLimit = phase === 'grace' ? 0 : plan.promoEmailsPerPeriod;
  return {
    plan,
    phase: isPlatformOrganizer(o.email) ? 'active' as const : phase,
    expiresAt: plan.key === 'PRO' ? o.planExpiresAt : null,
    graceEndsAt: phase === 'grace' ? graceEndsAt : null,
    upcoming,
    team,
    promo: { used: promoUsed, limit: promoLimit, left: Math.max(0, promoLimit - promoUsed) },
  };
}

/**
 * Mark an order paid and apply it. Idempotent (checkout callback and webhook can both arrive).
 * PRO: starts or extends 30 days and features every upcoming event. BOOST: features that event until it ends.
 * Either way the registration limit rises, so waitlisted people move into the new spots afterwards.
 */
export async function activateOrganizerPayment(orderId: string, paymentId: string): Promise<'activated' | 'already' | 'unknown'> {
  let applied: { kind: string; organizerId: string; eventId: string | null; paymentId: string } | null = null;
  const result = await prisma.$transaction(async (tx) => {
    const pay = await tx.organizerPayment.findUnique({ where: { razorpayOrderId: orderId } });
    if (!pay) return 'unknown';
    const flipped = await tx.organizerPayment.updateMany({
      where: { id: pay.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUCCESS', razorpayPaymentId: paymentId, paidAt: new Date() },
    });
    if (!flipped.count) return 'already';
    const now = Date.now();

    if (pay.kind === 'PRO') {
      const o = await tx.eventOrganizer.findUniqueOrThrow({ where: { id: pay.organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
      const active = effectiveHostPlan(o, now).key === 'PRO';
      const base = active && o.planExpiresAt ? Math.max(now, o.planExpiresAt.getTime()) : now;
      const end = new Date(base + HOST_PERIOD_DAYS * 864e5);
      await tx.eventOrganizer.update({ where: { id: pay.organizerId }, data: { plan: 'PRO', planExpiresAt: end, planReminderSentAt: null, planGraceNoticeAt: null } });
      await tx.organizerPayment.update({ where: { id: pay.id }, data: { periodStart: new Date(base), periodEnd: end } });
      await featureUpcoming(tx, pay.organizerId, new Date(end.getTime() + HOST_GRACE_DAYS * 864e5));
    } else if (pay.kind === 'BOOST' && pay.eventId) {
      const ev = await tx.event.findFirst({ where: { id: pay.eventId, organizerId: pay.organizerId }, select: { endAt: true, featuredUntil: true } });
      if (ev) {
        const until = ev.featuredUntil && ev.featuredUntil > ev.endAt ? ev.featuredUntil : ev.endAt;
        await tx.event.update({ where: { id: pay.eventId }, data: { boostedAt: new Date(), featuredUntil: until, promoCredits: { increment: 1 } } });
      }
    }
    applied = { kind: pay.kind, organizerId: pay.organizerId, eventId: pay.eventId, paymentId: pay.id };
    return 'activated' as const;
  });

  const done = applied as { kind: string; organizerId: string; eventId: string | null; paymentId: string } | null;
  if (result === 'activated' && done) {
    await emailInvoice('organizer', done.paymentId).catch((e) => console.error('[invoice] organizer', e));
    // Outside the payment transaction: a slow email or a busy waitlist must never undo a payment.
    const fill = done.kind === 'BOOST' && done.eventId ? promoteWaitlist(done.eventId) : promoteWaitlistsForOrganizer(done.organizerId);
    await fill.catch((e) => console.error('promoteWaitlist after payment failed', e));
  }
  return result;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Pro: feature each upcoming event until it ends or the plan does, whichever is first (never shortening a Boost). */
/** Pro features every upcoming event until it ends, or until Pro's grace days end, whichever is first. */
async function featureUpcoming(tx: Tx, organizerId: string, planEnd: Date) {
  const events = await tx.event.findMany({ where: upcomingWhere(organizerId), select: { id: true, endAt: true, featuredUntil: true } });
  for (const e of events) {
    const until = new Date(Math.min(e.endAt.getTime(), planEnd.getTime()));
    if (!e.featuredUntil || e.featuredUntil < until) await tx.event.update({ where: { id: e.id }, data: { featuredUntil: until } });
  }
}

/** For an event being published now: featured while Pro is active. */
export async function featuredUntilFor(organizerId: string, endAt: Date): Promise<Date | null> {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
  if (!o || effectiveHostPlan(o).key !== 'PRO' || !o.planExpiresAt) return null;
  return new Date(Math.min(endAt.getTime(), o.planExpiresAt.getTime() + HOST_GRACE_DAYS * 864e5));
}

/** Daily: remind 3 days before Pro ends, email when it ends (3 grace days), then drop to Free. Featured dates stop on their own. */
export async function runHostPlanMaintenance(now = new Date(), opts: { onlyOrganizerId?: string } = {}) {
  const only = opts.onlyOrganizerId ? { id: opts.onlyOrganizerId } : {};
  const due = await prisma.eventOrganizer.findMany({
    where: { plan: 'PRO', planExpiresAt: { gt: now, lte: new Date(now.getTime() + 3 * 864e5) }, planReminderSentAt: null, deletedAt: null, ...only },
    select: { id: true, email: true, planExpiresAt: true },
    take: 500,
  });
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  for (const o of due) {
    const date = o.planExpiresAt!.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
    sendEmailFireAndForget({
      to: o.email,
      subject: `Your Udyaibase Pro plan ends on ${date}`,
      type: 'organizer_plan_ending',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your Pro plan ends on ${esc(date)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">After that you move to Free: up to ${HOST_PLANS.FREE.maxUpcomingEvents} upcoming events and ${HOST_PLANS.FREE.registrationsPerEvent} registrations per event, and your events stop being featured. Everything you’ve published stays live.</p>
<p style="margin:0 0 24px">${button(`${site}/organizer/billing`, 'Add 30 days')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">Plans never renew automatically, so nothing is charged unless you pay.</p>`),
    });
    await prisma.eventOrganizer.update({ where: { id: o.id }, data: { planReminderSentAt: now } });
  }
  // Day Pro ends: "renew within 3 days" (featured events and limits carry on; promo emails pause).
  const ended = await prisma.eventOrganizer.findMany({
    where: { plan: 'PRO', planGraceNoticeAt: null, planExpiresAt: { lte: now, gt: new Date(now.getTime() - HOST_GRACE_DAYS * 864e5) }, deletedAt: null, ...only },
    select: { id: true, email: true, planExpiresAt: true },
    take: 500,
  });
  for (const o of ended) {
    if (isPlatformOrganizer(o.email)) continue;
    const date = new Date(o.planExpiresAt!.getTime() + HOST_GRACE_DAYS * 864e5).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
    sendEmailFireAndForget({
      to: o.email,
      subject: `Your Pro plan has ended: renew by ${date}`,
      type: 'organizer_plan_grace',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your Pro plan has ended</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Your events stay featured and your limits stay the same until <strong>${esc(date)}</strong>. New promo emails are paused. Renew before then to carry on without any change.</p>
<p style="margin:0 0 24px">${button(`${site}/organizer/billing`, 'Renew now')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">After that you move to Free. Everything you’ve published stays live.</p>`),
    });
    await prisma.eventOrganizer.update({ where: { id: o.id }, data: { planGraceNoticeAt: now } });
  }
  const lapsed = await prisma.eventOrganizer.updateMany({ where: { plan: 'PRO', planExpiresAt: { lte: new Date(now.getTime() - HOST_GRACE_DAYS * 864e5) }, ...only }, data: { plan: 'FREE' } });
  return { hostRemindersSent: due.length, hostGraceNoticesSent: ended.length, hostPlansLapsed: lapsed.count };
}

/** Null when another event can go live; otherwise the message to show. */
export async function upcomingLimitProblem(organizerId: string, excludeEventId?: string): Promise<string | null> {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
  const plan = o ? effectiveHostPlan(o) : HOST_PLANS.FREE;
  const count = await prisma.event.count({ where: { ...upcomingWhere(organizerId), ...(excludeEventId ? { id: { not: excludeEventId } } : {}) } });
  if (count < plan.maxUpcomingEvents) return null;
  return `The ${plan.name} plan allows ${plan.maxUpcomingEvents} upcoming events at a time. Unpublish one, wait until one ends, or upgrade to Pro for unlimited events.`;
}

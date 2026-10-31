'use server';

import { randomUUID } from 'crypto';
import { prisma } from '@udyaibase/database';
import { requireActionAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { GRACE_DAYS, GST_RATE, PLANS } from '@udyaibase/utils/employer-plans';
import { refreshPublic } from '@/lib/refresh-public';

/**
 * Manual plan grants for customers who pay by invoice or UPI. Mirrors what a Razorpay payment does in
 * the web app (apps/web/lib/employer/billing.ts, apps/web/lib/events/billing.ts), and records a payment
 * row with a `manual_` reference so it shows in the customer's billing history. Super admins only.
 */

const DAY = 864e5;

export interface PlanAccount {
  kind: 'EMPLOYER' | 'HOST';
  id: string;
  name: string;
  email: string;
  plan: string;
  planExpiresAt: string | null;
}

export async function listPlanAccountsAction(q: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false as const, error };
  const term = q.trim();
  const match = term ? { contains: term, mode: 'insensitive' as const } : undefined;
  const [employers, hosts] = await Promise.all([
    prisma.jobBoardEmployer.findMany({
      where: { deletedAt: null, ...(match ? { OR: [{ companyName: match }, { email: match }] } : { plan: { not: 'FREE' } }) },
      orderBy: { updatedAt: 'desc' }, take: 30,
      select: { id: true, companyName: true, email: true, plan: true, planExpiresAt: true },
    }),
    prisma.eventOrganizer.findMany({
      where: { deletedAt: null, ...(match ? { OR: [{ name: match }, { company: match }, { email: match }] } : { plan: { not: 'FREE' } }) },
      orderBy: { updatedAt: 'desc' }, take: 30,
      select: { id: true, name: true, company: true, email: true, plan: true, planExpiresAt: true },
    }),
  ]);
  const data: PlanAccount[] = [
    ...employers.map((e) => ({ kind: 'EMPLOYER' as const, id: e.id, name: e.companyName, email: e.email, plan: e.plan, planExpiresAt: e.planExpiresAt?.toISOString() ?? null })),
    ...hosts.map((o) => ({ kind: 'HOST' as const, id: o.id, name: o.company || o.name, email: o.email, plan: o.plan, planExpiresAt: o.planExpiresAt?.toISOString() ?? null })),
  ];
  return { success: true as const, data };
}

export async function grantPlanAction(input: { kind: 'EMPLOYER' | 'HOST'; id: string; plan: string; days: number; amountRupees: number; reference: string }) {
  const { session, error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false as const, error };
  const days = Math.round(Number(input.days));
  if (!Number.isFinite(days) || days < 1 || days > 400) return { success: false as const, error: 'Days must be between 1 and 400.' };
  const reference = String(input.reference ?? '').trim().slice(0, 120);
  if (reference.length < 3) return { success: false as const, error: 'Add a reference (invoice no. or UPI ref).' };
  const totalPaise = Math.max(0, Math.round(Number(input.amountRupees || 0) * 100));
  const amountPaise = Math.round(totalPaise / (1 + GST_RATE));
  const now = Date.now();
  const orderRef = `manual_${randomUUID()}`;
  const by = session?.user?.email ?? 'admin';

  if (input.kind === 'EMPLOYER') {
    if (input.plan !== 'FEATURED' && input.plan !== 'PREMIUM') return { success: false as const, error: 'Choose Featured or Premium.' };
    const e = await prisma.jobBoardEmployer.findUnique({ where: { id: input.id }, select: { companyName: true, plan: true, planExpiresAt: true } });
    if (!e) return { success: false as const, error: 'Employer not found.' };
    const sameActive = e.plan === input.plan && e.planExpiresAt && e.planExpiresAt.getTime() > now;
    const base = sameActive ? e.planExpiresAt!.getTime() : now;
    const end = new Date(base + days * DAY);
    await prisma.$transaction([
      prisma.jobBoardEmployer.update({ where: { id: input.id }, data: { plan: input.plan as 'FEATURED' | 'PREMIUM', planExpiresAt: end, maxActiveJobs: PLANS[input.plan as 'FEATURED' | 'PREMIUM'].maxActiveJobs, planIsTrial: false, planReminderSentAt: null, planGraceNoticeAt: null } }),
      prisma.jobBoardListing.updateMany({ where: { employerId: input.id, status: 'OPEN', deletedAt: null }, data: { isFeatured: true, featuredUntil: new Date(end.getTime() + GRACE_DAYS * DAY) } }),
      prisma.jobBoardPayment.create({ data: {
        employerId: input.id, plan: input.plan as 'FEATURED' | 'PREMIUM', amountPaise, gstPaise: totalPaise - amountPaise, totalPaise,
        razorpayOrderId: orderRef, razorpayPaymentId: `${orderRef}:${reference}`, status: 'SUCCESS', periodStart: new Date(base), periodEnd: end, paidByEmail: by, paidAt: new Date(),
      } }),
    ]);
    await logAuditEvent({ action: 'UPDATE', resourceType: 'EMPLOYER', resourceId: input.id, resourceName: e.companyName, before: { plan: e.plan, planExpiresAt: e.planExpiresAt }, after: { plan: input.plan, planExpiresAt: end, reference, totalPaise } });
    await refreshPublic(['jobs']); return { success: true as const, planExpiresAt: end.toISOString() };
  }

  if (input.plan !== 'PRO') return { success: false as const, error: 'Event hosts can only get Pro.' };
  const o = await prisma.eventOrganizer.findUnique({ where: { id: input.id }, select: { name: true, plan: true, planExpiresAt: true } });
  if (!o) return { success: false as const, error: 'Event host not found.' };
  const active = o.plan === 'PRO' && o.planExpiresAt && o.planExpiresAt.getTime() > now;
  const base = active ? o.planExpiresAt!.getTime() : now;
  const end = new Date(base + days * DAY);
  const upcoming = await prisma.event.findMany({ where: { organizerId: input.id, status: 'PUBLISHED', deletedAt: null, endAt: { gt: new Date() } }, select: { id: true, endAt: true, featuredUntil: true } });
  await prisma.$transaction([
    prisma.eventOrganizer.update({ where: { id: input.id }, data: { plan: 'PRO', planExpiresAt: end, planReminderSentAt: null, planGraceNoticeAt: null } }),
    ...upcoming.map((ev) => {
      const until = new Date(Math.min(ev.endAt.getTime(), end.getTime() + GRACE_DAYS * DAY)); // featured through Pro's grace days
      return prisma.event.update({ where: { id: ev.id }, data: { featuredUntil: ev.featuredUntil && ev.featuredUntil > until ? ev.featuredUntil : until } });
    }),
    prisma.organizerPayment.create({ data: {
      organizerId: input.id, kind: 'PRO', amountPaise, gstPaise: totalPaise - amountPaise, totalPaise,
      razorpayOrderId: orderRef, razorpayPaymentId: `${orderRef}:${reference}`, status: 'SUCCESS', periodStart: new Date(base), periodEnd: end, paidByEmail: by, paidAt: new Date(),
    } }),
  ]);
  await logAuditEvent({ action: 'UPDATE', resourceType: 'USER', resourceId: input.id, resourceName: `Event host ${o.name}`, before: { plan: o.plan, planExpiresAt: o.planExpiresAt }, after: { plan: 'PRO', planExpiresAt: end, reference, totalPaise } });
  await refreshPublic(['jobs']); return { success: true as const, planExpiresAt: end.toISOString() };
}

/** End a paid plan now (refund, abuse). The account drops to Free immediately; open jobs and events stay. */
export async function endPlanAction(input: { kind: 'EMPLOYER' | 'HOST'; id: string }) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false as const, error };
  await endPlanNow(input.kind, input.id);
  return { success: true as const };
}

/** Shared by "End plan" and refunds. Callers check SUPER_ADMIN first. */
export async function endPlanNow(kind: 'EMPLOYER' | 'HOST', id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) throw new Error(error);
  const now = new Date();
  if (kind === 'EMPLOYER') {
    await prisma.$transaction([
      prisma.jobBoardEmployer.update({ where: { id }, data: { plan: 'FREE', planExpiresAt: now, planIsTrial: false, maxActiveJobs: PLANS.FREE.maxActiveJobs } }),
      prisma.jobBoardListing.updateMany({ where: { employerId: id, isFeatured: true, featuredUntil: { gt: now } }, data: { isFeatured: false, featuredUntil: now } }),
    ]);
    await logAuditEvent({ action: 'UPDATE', resourceType: 'EMPLOYER', resourceId: id, after: { plan: 'FREE', endedByAdmin: true } });
    await refreshPublic(['jobs']); // featured placement ended
  } else {
    await prisma.$transaction([
      prisma.eventOrganizer.update({ where: { id }, data: { plan: 'FREE', planExpiresAt: now } }),
      // Keep featured dates bought with an Event Boost; only Pro-granted placement ends.
      prisma.event.updateMany({ where: { organizerId: id, boostedAt: null, featuredUntil: { gt: now } }, data: { featuredUntil: now } }),
    ]);
    await logAuditEvent({ action: 'UPDATE', resourceType: 'USER', resourceId: id, after: { plan: 'FREE', endedByAdmin: true } });
    await refreshPublic(['events']);
  }
}

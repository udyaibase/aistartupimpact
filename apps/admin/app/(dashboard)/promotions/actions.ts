'use server';

import { prisma } from '@udyaibase/database';
import { requireActionAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';

const ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];

export interface PromotionRow {
  id: string;
  title: string;
  slug: string;
  company: string;
  publishedAt: string | null;
  expiresAt: string | null;
  planEndsAt: string | null;
  newsletterAt: string | null;
  socialAt: string | null;
  socialUrl: string | null;
}

/** Open jobs from employers on an active Premium plan: the newsletter and social shares Premium includes. */
export async function getPromotionQueueAction() {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const now = new Date();
  const jobs = await prisma.jobBoardListing.findMany({
    where: {
      status: 'OPEN', deletedAt: null, moderationHold: false, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      Employer: { plan: 'PREMIUM', planExpiresAt: { gt: now } },
    },
    orderBy: [{ publishedAt: 'asc' }],
    take: 300,
    select: {
      id: true, title: true, slug: true, publishedAt: true, expiresAt: true,
      promotedNewsletterAt: true, promotedSocialAt: true, promotedSocialUrl: true,
      Employer: { select: { companyName: true, planExpiresAt: true } },
    },
  });
  const data: PromotionRow[] = jobs.map((j) => ({
    id: j.id, title: j.title, slug: j.slug, company: j.Employer.companyName,
    publishedAt: j.publishedAt?.toISOString() ?? null, expiresAt: j.expiresAt?.toISOString() ?? null,
    planEndsAt: j.Employer.planExpiresAt?.toISOString() ?? null,
    newsletterAt: j.promotedNewsletterAt?.toISOString() ?? null, socialAt: j.promotedSocialAt?.toISOString() ?? null, socialUrl: j.promotedSocialUrl,
  }));
  return { success: true as const, data };
}

export async function markPromotedAction(input: { id: string; channel: 'newsletter' | 'social'; done: boolean; socialUrl?: string }) {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const url = input.socialUrl?.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) return { success: false as const, error: 'Post link must start with https://' };
  const at = input.done ? new Date() : null;
  const data = input.channel === 'newsletter'
    ? { promotedNewsletterAt: at }
    : { promotedSocialAt: at, promotedSocialUrl: input.done ? (url || null) : null };
  const job = await prisma.jobBoardListing.update({ where: { id: input.id }, data, select: { title: true } });
  await logAuditEvent({ action: 'UPDATE', resourceType: 'JOB_LISTING', resourceId: input.id, resourceName: job.title, after: { promotion: input.channel, done: input.done, url: url ?? null } });
  return { success: true as const };
}

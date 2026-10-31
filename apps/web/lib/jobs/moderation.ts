import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { refreshPaths, refreshSections } from '@/lib/revalidate';
export { JOB_REPORT_REASONS } from '@/lib/jobs/report-reasons';

/** Distinct reporters within this window that put a job on hold for admin review. */
export const HOLD_THRESHOLD = 3;
const WINDOW_DAYS = 14;


export function reporterHash(ip: string, listingId: string): string {
  return crypto.createHash('sha256').update(`${process.env.APPLY_SESSION_SECRET ?? ''}:job-report:${ip}:${listingId}`).digest('hex').slice(0, 32);
}

/**
 * Record a report. Repeat reports from the same person are ignored. Reaching the threshold of
 * distinct reporters hides the job everywhere (isActive off) until an admin reviews it.
 */
export async function reportListing(opts: {
  listing: { id: string; title: string; slug: string };
  reason: string; details: string; email: string | null; hash: string;
}): Promise<{ duplicate: boolean; held: boolean }> {
  const { listing } = opts;
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
  const dup = await prisma.contentReport.findFirst({
    where: { entityType: 'JOB', entityId: listing.id, reporterHash: opts.hash, createdAt: { gte: since } },
    select: { id: true },
  });
  if (dup) return { duplicate: true, held: false };

  await prisma.contentReport.create({
    data: {
      entityType: 'JOB', entityId: listing.id, entityName: listing.title, entitySlug: listing.slug,
      reportType: opts.reason, description: opts.details || '(no details)', reporterEmail: opts.email, reporterHash: opts.hash,
    },
  });

  const reporters = await prisma.contentReport.findMany({
    where: { entityType: 'JOB', entityId: listing.id, status: { in: ['PENDING', 'REVIEWING'] }, createdAt: { gte: since } },
    distinct: ['reporterHash'],
    select: { reporterHash: true },
  });
  if (reporters.length < HOLD_THRESHOLD) return { duplicate: false, held: false };

  const held = await prisma.jobBoardListing.updateMany({
    where: { id: listing.id, moderationHold: false },
    data: { moderationHold: true, moderationHoldAt: new Date(), isActive: false },
  });
  if (held.count > 0) refreshSections(['jobs', 'startups', 'home']);
  return { duplicate: false, held: held.count > 0 };
}

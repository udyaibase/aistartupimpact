import { prisma } from '@udyaibase/database';
import { ATTENTION_QUEUES, type AttentionCounts } from '@/lib/attention-queues';
import { canOpen } from '@/lib/section-access';

/**
 * How many items wait in each queue. Each rule is the same one the section's own list uses for "waiting", so a
 * badge always matches what the page shows.
 */
const COUNTERS: Record<string, () => Promise<number>> = {
  '/articles': () => prisma.article.count({ where: { deletedAt: null, status: 'IN_REVIEW' } }),
  // Waiting for a decision only: ones sent back to the founder or turned down are not ours to act on.
  '/startups-dir/review': () => prisma.startup.count({ where: { deletedAt: null, isApproved: false, reviewStatus: 'IN_REVIEW', claimStatus: { not: 'REJECTED' } } }),
  '/tools-dir': () => prisma.aiTool.count({ where: { deletedAt: null, status: 'PENDING', reviewStatus: 'IN_REVIEW', claimStatus: { not: 'REJECTED' } } }),
  '/tool-reviews': () => prisma.toolReview.count({ where: { status: 'PENDING' } }),
  '/startup-reviews': () => prisma.startupReview.count({ where: { status: 'PENDING' } }),
  '/events/review': () => prisma.event.count({ where: { deletedAt: null, status: 'PENDING_REVIEW' } }),
  '/listing-edits': () => prisma.listingPendingEdit.count({ where: { status: 'PENDING' } }),
  '/content-review': () => prisma.article.count({ where: { deletedAt: null, moderationStatus: 'PENDING_REVIEW', type: { in: ['FOUNDER_STORY', 'STARTUP_UPDATE'] } } }),
  '/reports': () => prisma.contentReport.count({ where: { status: { in: ['PENDING', 'REVIEWING'] } } }),
  '/support': () => prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  '/employers': () => prisma.jobBoardEmployer.count({ where: { companyReview: 'PENDING', deletedAt: null } }),
  '/applications': () => prisma.jobApplication.count({ where: { status: 'NEW' } }),
  '/billing': () => prisma.eventRegistration.count({ where: { paymentStatus: 'REFUND_PENDING' } }),
};

/** Queues this role can act on. */
export function queuesFor(role: string | null | undefined) {
  return ATTENTION_QUEUES.filter((q) => !!role && canOpen(role, q.href) && (!q.roles || q.roles.includes(role)));
}

/**
 * Counts for the queues this role can act on, and nothing else: a Writer never learns how many refunds are pending.
 * A count that fails is left out rather than breaking the menu.
 */
export async function getAttentionCounts(role: string | null | undefined): Promise<AttentionCounts> {
  const queues = queuesFor(role);
  const results = await Promise.all(queues.map((q) => COUNTERS[q.href]().catch((err) => {
    console.error('[attention]', q.href, err instanceof Error ? err.message : err);
    return 0;
  })));
  const counts: AttentionCounts = {};
  queues.forEach((q, i) => { if (results[i] > 0) counts[q.href] = results[i]; });
  return counts;
}

export const attentionCounterKeys = () => Object.keys(COUNTERS);

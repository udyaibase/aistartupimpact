import { prisma } from '@udyaibase/database';

export type ListingStatus = 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED';
export type CloseReason = 'EXPIRED' | 'FILLED' | 'MANUAL';

/**
 * The only writer of `status` and the deprecated `isActive` flag, so the two never drift.
 * OPEN ⇔ isActive. Returns the number of rows changed.
 */
export async function setListingStatus(
  listingIds: string | string[],
  status: ListingStatus,
  reason?: CloseReason,
): Promise<number> {
  const ids = Array.isArray(listingIds) ? listingIds : [listingIds];
  if (ids.length === 0) return 0;
  const now = new Date();
  const res = await prisma.jobBoardListing.updateMany({
    where: { id: { in: ids } },
    data: {
      status,
      isActive: status === 'OPEN',
      closedAt: status === 'CLOSED' ? now : null,
      closeReason: status === 'CLOSED' ? reason ?? 'MANUAL' : null,
    },
  });
  if (status === 'OPEN') {
    // A job under moderation review stays hidden even if the employer resumes it.
    await prisma.jobBoardListing.updateMany({ where: { id: { in: ids }, moderationHold: true }, data: { isActive: false } });
    // First publish only: pausing and resuming must not bump a job back to the top.
    await prisma.jobBoardListing.updateMany({ where: { id: { in: ids }, publishedAt: null }, data: { publishedAt: now } });
  }
  return res.count;
}

import { prisma } from '@udyaibase/database';
import { listingFieldLabel, listingValueText, type ListingType } from '@udyaibase/utils';
import type { FounderSession } from '@/lib/founder-auth';
import { canEditStartup, type FounderTeamRole } from '@/lib/founder-team-permissions';
import { roleForOwner } from '@/lib/founder/access';

/** The listing and this person's role on it, or null when it's gone or they have no access. */
export async function listingAccess(session: Pick<FounderSession, 'userId' | 'email'>, type: ListingType, id: string): Promise<{ ownerId: string; role: FounderTeamRole; canEdit: boolean; name: string } | null> {
  const listing = type === 'startup'
    ? await prisma.startup.findFirst({ where: { id, deletedAt: null }, select: { ownerId: true, name: true } })
    : await prisma.aiTool.findFirst({ where: { id, deletedAt: null }, select: { ownerId: true, name: true } });
  if (!listing?.ownerId) return null;
  const role = await roleForOwner(session, listing.ownerId);
  return role ? { ownerId: listing.ownerId, role, canEdit: canEditStartup(role), name: listing.name } : null;
}

/** How many fields of each listing are waiting for an admin. */
export async function pendingEditCounts(type: ListingType, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.listingPendingEdit.groupBy({
    by: ['entityId'],
    where: { entityType: type, entityId: { in: ids }, status: 'PENDING' },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.entityId, r._count._all]));
}

/** Fields waiting for an admin, in words for the edit page. */
export async function pendingEditsFor(type: ListingType, id: string) {
  const rows = await prisma.listingPendingEdit.findMany({
    where: { entityType: type, entityId: id, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, field: true, newValue: true, submittedByName: true },
  });
  return rows.map((r) => ({ id: r.id, label: listingFieldLabel(r.field), value: listingValueText(r.newValue), by: r.submittedByName ?? '' }));
}

'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@udyaibase/database';
import type { ListingType } from '@udyaibase/utils';
import { requireFounderAuth } from '@/lib/founder-auth';
import { listingAccess } from '@/lib/founder/listing-access';

/** Takes back a change still waiting for review. Anyone who can edit the listing can do this. */
export async function cancelPendingEditAction(editId: string) {
  const session = await requireFounderAuth();
  const edit = await prisma.listingPendingEdit.findFirst({ where: { id: editId, status: 'PENDING' }, select: { entityType: true, entityId: true } });
  if (!edit) return { success: false };
  const access = await listingAccess(session, edit.entityType as ListingType, edit.entityId);
  if (!access?.canEdit) return { success: false };
  await prisma.listingPendingEdit.updateMany({ where: { id: editId, status: 'PENDING' }, data: { status: 'WITHDRAWN', reviewedAt: new Date() } });
  revalidatePath('/founder/startups');
  revalidatePath('/founder/tools');
  return { success: true };
}

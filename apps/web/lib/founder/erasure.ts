import { eraseFounderRecords } from '@udyaibase/database';
import { logFounderActivity } from '@/lib/founder/activity';
import { deleteUnusedMedia } from '@/lib/media/delete-public';

/** A founder deleting their own account. See eraseFounderRecords for what goes and what stays. */
export async function eraseFounderAccount(founderId: string): Promise<void> {
  const erased = await eraseFounderRecords(founderId);
  if (!erased) return;
  await logFounderActivity(founderId, 'account_deleted');
  await deleteUnusedMedia(erased.mediaUrls);
}

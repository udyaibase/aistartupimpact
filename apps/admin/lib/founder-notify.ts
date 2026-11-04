import { randomUUID } from 'crypto';
import { prisma } from '@udyaibase/database';

/** Puts a note in a founder's portal bell. Never fails the action that triggered it. */
export async function notifyFounder(founderId: string | null | undefined, note: { type: string; title: string; message: string; link?: string }): Promise<void> {
  if (!founderId) return;
  await prisma.founderNotification.create({ data: { id: randomUUID(), userId: founderId, ...note, link: note.link ?? null } })
    .catch((err: unknown) => console.error('[founder-notify]', err instanceof Error ? err.message : 'unknown error'));
}

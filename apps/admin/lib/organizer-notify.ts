import { prisma } from '@udyaibase/database';

/**
 * Puts a note in an organizer workspace's portal bell (the same updates we email, for whoever misses the email).
 * Never fails the action that triggered it.
 */
export async function notifyOrganizer(organizerId: string | null | undefined, note: { type: string; title: string; message: string; link?: string }): Promise<void> {
  if (!organizerId) return;
  try {
    await prisma.organizerNotification.create({
      data: { organizerId, type: note.type, title: note.title.slice(0, 200), message: note.message.slice(0, 500), link: note.link ?? null },
    });
  } catch (err) {
    console.error('[organizer-notify]', err instanceof Error ? err.message : 'unknown error');
  }
}

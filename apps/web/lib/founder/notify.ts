import { randomUUID } from 'crypto';
import { prisma } from '@udyaibase/database';

/**
 * Puts a note in a founder's portal bell (the same updates we email, for whoever misses the email). By founder id, or
 * by email for someone who may or may not have a founder account (nothing is written when they don't). Never throws.
 */
type FounderNote = { type: string; title: string; message: string; link?: string };

export async function notifyFounder(founderId: string | null | undefined, note: FounderNote): Promise<void> {
  if (!founderId) return;
  try {
    await prisma.founderNotification.create({
      data: { id: randomUUID(), userId: founderId, type: note.type, title: note.title.slice(0, 200), message: note.message.slice(0, 500), link: note.link ?? null },
    });
  } catch (err) {
    console.error('[founder-notify]', err instanceof Error ? err.message : 'unknown error');
  }
}

export async function notifyFounderByEmail(email: string | null | undefined, note: FounderNote): Promise<void> {
  const addr = (email ?? '').trim().toLowerCase();
  if (!addr) return;
  try {
    const f = await prisma.founderUser.findFirst({ where: { email: { equals: addr, mode: 'insensitive' } }, select: { id: true } });
    if (f) await notifyFounder(f.id, note);
  } catch (err) {
    console.error('[founder-notify]', err instanceof Error ? err.message : 'unknown error');
  }
}

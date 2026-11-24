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

/**
 * "N people are waiting for your approval" for one event: a single note kept up to date (not one per registration),
 * so a busy event doesn't flood the bell. A new note starts once the previous one has been read.
 */
export async function notifyPendingApprovals(organizerId: string, eventId: string, eventTitle: string): Promise<void> {
  try {
    const pending = await prisma.eventRegistration.count({ where: { eventId, status: 'PENDING_APPROVAL', deletedAt: null } });
    if (!pending) return;
    const link = `/organizer/events/${eventId}`;
    const note = {
      title: `${pending} ${pending === 1 ? 'person is' : 'people are'} waiting for approval`,
      message: `New registrations for ${eventTitle} need your approval before they get a ticket.`.slice(0, 500),
    };
    const open = await prisma.organizerNotification.findFirst({ where: { organizerId, type: 'approval_pending', link, read: false }, select: { id: true } });
    if (open) await prisma.organizerNotification.update({ where: { id: open.id }, data: { ...note, createdAt: new Date() } });
    else await prisma.organizerNotification.create({ data: { organizerId, type: 'approval_pending', link, ...note } });
  } catch (err) {
    console.error('[organizer-notify] approvals', err instanceof Error ? err.message : 'unknown error');
  }
}

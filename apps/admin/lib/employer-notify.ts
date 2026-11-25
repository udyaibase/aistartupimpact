import { prisma } from '@udyaibase/database';

/**
 * Puts a note in an employer's portal bell (the web app's lib/employer/notify.ts has the full version). `email` picks
 * the person: the account owner or the team member with that address; without it, the owner. Never throws.
 */
export async function notifyEmployerPerson(employerId: string | null | undefined, note: { type: string; title: string; message: string; link?: string }, email?: string | null): Promise<void> {
  if (!employerId) return;
  try {
    const owner = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { email: true, passwordHash: true } });
    if (!owner) return;
    // The owner usually also has an Owner member row with the same email: file it there, so it shows however they sign in.
    const ownerEmail = owner.email.toLowerCase();
    const addr = (email ?? '').trim().toLowerCase() || ownerEmail;
    const m = await prisma.jobBoardTeamMember.findFirst({ where: { employerId, email: { equals: addr, mode: 'insensitive' }, status: 'ACTIVE' }, select: { id: true } });
    let memberId: string | null = m?.id ?? null;
    if (!m) {
      if (addr !== ownerEmail || owner.passwordHash === '') return; // not in this workspace, or a placeholder with nobody to tell
      memberId = null;
    }
    await prisma.employerNotification.create({
      data: { employerId, memberId, type: note.type, title: note.title.slice(0, 200), message: note.message.slice(0, 500), link: note.link ?? null },
    });
  } catch (err) {
    console.error('[employer-notify]', err instanceof Error ? err.message : 'unknown error');
  }
}

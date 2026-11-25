import { prisma } from '@udyaibase/database';

/**
 * The employer portal bell. Each note is for one person: the account owner (memberId null) or a team member, so read
 * marks are personal. `to` picks who gets it:
 *  - 'team' (default): the owner and every active owner/recruiter member (not interviewers, who only see their jobs);
 *  - 'owners': the owner and Owner-role members (plan, billing and approval matters);
 *  - 'owner': the account owner only;
 *  - { email }: whoever in the workspace has that address (owner or member), e.g. the person an email was sent to;
 *  - { memberId }: one team member.
 * Never fails the action that triggered it.
 */
export type EmployerNote = { type: string; title: string; message: string; link?: string };
export type EmployerNoteTo = 'team' | 'owners' | 'owner' | { email: string } | { memberId: string | null };

export async function notifyEmployer(employerId: string | null | undefined, note: EmployerNote, to: EmployerNoteTo = 'team'): Promise<void> {
  if (!employerId) return;
  try {
    const recipients = await recipientsFor(employerId, to);
    if (!recipients.length) return;
    const data = { type: note.type, title: note.title.slice(0, 200), message: note.message.slice(0, 500), link: note.link ?? null };
    await prisma.employerNotification.createMany({ data: recipients.map((memberId) => ({ employerId, memberId, ...data })) });
  } catch (err) {
    console.error('[employer-notify]', err instanceof Error ? err.message : 'unknown error');
  }
}

/**
 * Member ids to write for (null = the account owner). The owner often also has an Owner-role member row with the same
 * email (signing in with a code uses it), so the owner is written under that member id: one note per person, which
 * shows whichever way they sign in. Admin-managed placeholder accounts (no password) have no owner to tell.
 */
async function recipientsFor(employerId: string, to: EmployerNoteTo): Promise<(string | null)[]> {
  const owner = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { email: true, passwordHash: true } });
  if (!owner) return [];
  const ownerEmail = owner.email.toLowerCase();
  const members = await prisma.jobBoardTeamMember.findMany({ where: { employerId, status: 'ACTIVE' }, select: { id: true, email: true, role: true }, take: 200 });
  const ownerMember = members.find((m) => m.email.toLowerCase() === ownerEmail);
  const ownerHere: (string | null)[] = ownerMember ? [ownerMember.id] : owner.passwordHash !== '' ? [null] : [];
  const others = members.filter((m) => m !== ownerMember);

  if (to === 'owner') return ownerHere;
  if (typeof to === 'object' && 'memberId' in to) return to.memberId ? [to.memberId] : ownerHere;
  if (typeof to === 'object' && 'email' in to) {
    const email = to.email.trim().toLowerCase();
    if (email === ownerEmail) return ownerHere;
    const m = others.find((x) => x.email.toLowerCase() === email);
    return m ? [m.id] : [];
  }
  const wanted = others.filter((m) => (to === 'owners' ? m.role === 'OWNER' : m.role !== 'INTERVIEWER'));
  return [...ownerHere, ...wanted.map((m) => m.id)];
}

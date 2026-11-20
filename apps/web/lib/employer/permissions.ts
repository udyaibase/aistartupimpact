import { NextResponse } from 'next/server';
import type { EmployerSession } from '@/lib/employer-auth';

export { can, PERMISSIONS, ROLE_LABEL, ROLE_DESCRIPTION, type Permission } from '@/lib/employer/roles';

/** Prisma `where` for the job listings this person may see (interviewers can be limited to some jobs). */
export function listingScope(session: Pick<EmployerSession, 'id' | 'jobIds'>) {
  return { employerId: session.id, ...(session.jobIds ? { id: { in: session.jobIds } } : {}) };
}

export function canSeeJob(session: Pick<EmployerSession, 'jobIds'>, listingId: string): boolean {
  return !session.jobIds || session.jobIds.includes(listingId);
}

/** 403 for a signed-in teammate whose role doesn't allow the action. */
export function forbidden() {
  return NextResponse.json({ error: 'Your role doesn’t allow this. Ask a workspace owner.', code: 'forbidden' }, { status: 403 });
}

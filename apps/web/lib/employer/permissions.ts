import { NextResponse } from 'next/server';
import { getEmployerSession, type EmployerSession } from '@/lib/employer-auth';
import { can, type Permission } from '@/lib/employer/roles';

export { can, PERMISSIONS, ROLE_LABEL, ROLE_DESCRIPTION, type Permission } from '@/lib/employer/roles';

/** For API routes: the session if allowed, otherwise a ready 401/403 response. */
export async function requireEmployerPermission(permission: Permission): Promise<EmployerSession | NextResponse> {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, permission)) return forbidden();
  return session;
}

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

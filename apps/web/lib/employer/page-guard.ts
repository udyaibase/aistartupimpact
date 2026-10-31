import { redirect } from 'next/navigation';
import { getEmployerSession, type EmployerSession } from '@/lib/employer-auth';
import { can, type Permission } from '@/lib/employer/roles';

/** For portal pages: signed in and allowed, or redirected somewhere they can use. */
export async function requirePagePermission(permission: Permission): Promise<EmployerSession> {
  const session = await getEmployerSession();
  if (!session) redirect('/employer/login');
  if (!can(session.role, permission)) redirect(session.role === 'INTERVIEWER' ? '/employer/applications' : '/employer/dashboard');
  return session;
}

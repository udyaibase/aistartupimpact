import { employerApi } from '@/lib/employer/api-session';
import { forbidden } from '@/lib/employer/permissions';

/** Importing candidates needs both managing jobs and moving candidates (owners and recruiters with full access). */
export async function importSession() {
  const guard = await employerApi(['jobs.manage', 'candidates.move']);
  if (guard.error) return guard;
  if (guard.session.jobIds) return { error: forbidden() };
  return guard;
}

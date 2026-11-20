import { NextResponse } from 'next/server';
import { getEmployerSession, type EmployerSession } from '@/lib/employer-auth';
import { canSeeJob, forbidden } from '@/lib/employer/permissions';
import { can, type Permission } from '@/lib/employer/roles';

type Guard = { session: EmployerSession; error?: never } | { session?: never; error: NextResponse };

/**
 * The one guard for hiring-portal API routes: who is signed in, whether their role allows it, and (when the route
 * is about one job) whether they may see that job. Every route under /api/employer uses it, and a test fails the
 * build for one that doesn't (__tests__/integration/employer-route-guard.test.ts).
 *
 *   const g = await employerApi('candidates.move');           // signed in + role
 *   const g = await employerApi('jobs.view', { job: id });    // + an interviewer limited to other jobs gets 404
 *   const g = await employerApi();                            // any signed-in teammate
 *   if (g.error) return g.error;
 *
 * Routes used to do these three checks by hand, and one forgot the third (an interviewer could read any job's
 * pipeline settings). A route that scopes its own query with listingScope() doesn't need `job`.
 */
export async function employerApi(permission?: Permission | Permission[], opts: { job?: string | null } = {}): Promise<Guard> {
  const session = await getEmployerSession();
  if (!session) return { error: NextResponse.json({ success: false, error: 'Please log in again.' }, { status: 401 }) };
  const needed = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  if (needed.some((p) => !can(session.role, p))) return { error: forbidden() };
  // The same answer as for a job that doesn't exist, so the reply doesn't confirm the job is there.
  if (opts.job && !canSeeJob(session, opts.job)) return { error: NextResponse.json({ success: false, error: 'Job not found.' }, { status: 404 }) };
  return { session };
}

export const fail = (r: { error: string; status: number; [k: string]: unknown }) => {
  const { status, ...body } = r;
  return NextResponse.json(body, { status });
};

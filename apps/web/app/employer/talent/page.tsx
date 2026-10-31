import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { can } from '@/lib/employer/roles';
import { loadTalentPool, openJobsFor } from '@/lib/employer/talent';
import TalentPool from '@/components/employer/talent/TalentPool';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Talent pool' };

export default async function TalentPage() {
  const session = await requirePagePermission('candidates.view');
  // The talent pool spans every job; interviewers limited to some jobs don't get it.
  if (session.jobIds) redirect('/employer/applications');
  const [people, jobs] = await Promise.all([loadTalentPool(session.id), openJobsFor(session.id)]);
  return <TalentPool people={people} jobs={jobs} canInvite={can(session.role, 'candidates.move')} />;
}

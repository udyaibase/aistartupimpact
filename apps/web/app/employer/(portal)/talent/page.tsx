import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { can } from '@/lib/employer/roles';
import { loadTalentPool, openJobsFor } from '@/lib/employer/talent';
import { prisma } from '@udyaibase/database';
import { cleanTalentFilters } from '@/lib/employer/talent-filters';
import TalentPool from '@/components/employer/talent/TalentPool';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Talent pool' };

export default async function TalentPage() {
  const session = await requirePagePermission('candidates.view');
  // The talent pool spans every job; interviewers limited to some jobs don't get it.
  if (session.jobIds) redirect('/employer/applications');
  const [pool, jobs, employer, searches] = await Promise.all([
    loadTalentPool(session.id),
    openJobsFor(session.id),
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { networkPilot: true } }),
    prisma.jobBoardSavedTalentSearch.findMany({ where: { employerId: session.id }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, filters: true, alert: true, createdByEmail: true } }),
  ]);
  return (
    <TalentPool
      people={pool.people}
      hiredHidden={pool.hiredHidden}
      jobs={jobs}
      savedSearches={searches.map((x) => ({ ...x, filters: cleanTalentFilters(x.filters) }))}
      myEmail={session.email}
      networkPilot={!!employer?.networkPilot}
      canInvite={can(session.role, 'candidates.move')}
      canNote={can(session.role, 'candidates.note')}
    />
  );
}

import { redirect } from 'next/navigation';
import { getEmployerSession } from '@/lib/employer-auth';
import { can } from '@/lib/employer/roles';
import { listTeam } from '@/lib/employer/team';
import { prisma } from '@udyaibase/database';
import TeamManager from '@/components/employer/team/TeamManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const session = await getEmployerSession();
  if (!session) redirect('/employer/login');
  const [team, jobs, employer] = await Promise.all([
    listTeam(session.id),
    prisma.jobBoardListing.findMany({ where: { employerId: session.id, deletedAt: null, status: { not: 'CLOSED' } }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, title: true, status: true } }),
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { requireJobApproval: true } }),
  ]);
  return (
    <TeamManager
      initialTeam={team}
      jobs={jobs}
      initialRequireApproval={employer?.requireJobApproval ?? false}
      canManage={can(session.role, 'team.manage')}
      me={{ memberId: session.memberId, email: session.email }}
    />
  );
}

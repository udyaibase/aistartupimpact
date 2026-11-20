import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { can } from '@/lib/employer/permissions';
import ImportWizard from '@/components/employer/import/ImportWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Import candidates' };

export default async function ImportCandidatesPage() {
  const session = await requirePagePermission('jobs.manage');
  if (!can(session.role, 'candidates.move') || session.jobIds) redirect('/employer/applications');
  const jobs = await prisma.jobBoardListing.findMany({
    where: { employerId: session.id, deletedAt: null, isGeneral: false },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, title: true, status: true },
    take: 300,
  });
  return <ImportWizard jobs={jobs.map((j) => ({ id: j.id, title: j.title, status: j.status }))} />;
}

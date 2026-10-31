import { notFound } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { getComposerContext } from '@/lib/employer/portal';
import { draftFromRow } from '@/lib/jobs/composer';
import JobComposer from '@/components/employer/jobs/JobComposer';

export const dynamic = 'force-dynamic';

export default async function EditJobPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await requirePagePermission('jobs.manage');

  const job = await prisma.jobBoardListing.findFirst({ where: { id, employerId: session.id, deletedAt: null } });
  if (!job) notFound();

  const ctx = await getComposerContext(session.id, session.role);
  return (
    <JobComposer
      key={job.id}
      jobId={job.id}
      initialDraft={draftFromRow(job)}
      initialStatus={job.status}
      initialSlug={job.slug}
      initialSavedAt={job.status === 'DRAFT' ? (job.draftSavedAt ?? job.updatedAt).toISOString() : null}
      {...ctx}
      previousJobs={ctx.previousJobs.filter((p) => p.id !== job.id)}
      everPublished={!!job.publishedAt}
      approvalRequest={job.approvalRequestedAt ? { at: job.approvalRequestedAt.toISOString(), by: job.approvalRequestedBy } : null}
    />
  );
}

import { requirePagePermission } from '@/lib/employer/page-guard';
import { getComposerContext } from '@/lib/employer/portal';
import { emptyDraft } from '@/lib/jobs/composer';
import JobComposer from '@/components/employer/jobs/JobComposer';

export const metadata = { title: 'Post a job' };

export const dynamic = 'force-dynamic';

export default async function PostJobPage() {
  const session = await requirePagePermission('jobs.manage');
  const ctx = await getComposerContext(session.id, session.role, session.email);
  return <JobComposer initialDraft={emptyDraft()} initialStatus="NEW" {...ctx} />;
}

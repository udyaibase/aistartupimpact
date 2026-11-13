import { requirePagePermission } from '@/lib/employer/page-guard';
import WorkspaceActivityView from '@/components/portal/WorkspaceActivityView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity log' };

/** Who signed in and what changed in this hiring workspace. Owners and admins only. */
export default async function EmployerActivityPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  const session = await requirePagePermission('account.manage');
  return (
    <WorkspaceActivityView kind="EMPLOYER" workspaceId={session.id} basePath="/employer/activity" params={await searchParams}
      workLabel="Jobs" passwordHref="/employer/settings" supportHref="/employer/support" />
  );
}

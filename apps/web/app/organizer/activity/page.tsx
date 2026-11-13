import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import WorkspaceActivityView from '@/components/portal/WorkspaceActivityView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity log' };

/** Who signed in and what changed in this event-host workspace. Owners and admins only. */
export default async function OrganizerActivityPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  const session = await requirePermission('settings');
  if (session instanceof NextResponse) {
    return (
      <div className="font-jakarta">
        <h1 className="portal-title">Activity log</h1>
        <p className="portal-subtitle">Only the account owner or an admin can see the activity log.</p>
      </div>
    );
  }
  return (
    <WorkspaceActivityView kind="ORGANIZER" workspaceId={session.organizerId} basePath="/organizer/activity" params={await searchParams}
      workLabel="Events" passwordHref="/organizer/settings" supportHref="/organizer/support" />
  );
}

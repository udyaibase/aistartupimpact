import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { founderFromCookies } from '@/lib/founder/account';
import { getUnifiedSession } from '@/lib/unified-auth';
import { safeReturnPath } from '@/lib/safe-return';
import WorkspaceSetupClient from './WorkspaceSetupClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Setting up your workspace', robots: { index: false, follow: false } };

/**
 * Where a portal sends someone who is signed in but has no workspace there yet (for example, straight after choosing
 * "Open founder portal" at the end of onboarding). Creates the workspace, then continues where they were going.
 */
export default async function WorkspaceSetupPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; workspace?: string }> }) {
  const params = await searchParams;
  const workspace = params.workspace === 'organizer' ? 'organizer' : 'founder';
  const returnTo = safeReturnPath(params.returnTo, workspace === 'organizer' ? '/organizer' : '/founder/dashboard');
  const self = `/account/workspace-setup?workspace=${workspace}&returnTo=${encodeURIComponent(returnTo)}`;
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(self)}`;

  const store = await cookies();
  if (!store.has('unified_session') && !store.has('user-token') && !store.has('founder-token')) redirect(loginHref);

  if (workspace === 'founder') {
    const founder = await founderFromCookies();
    if (founder) redirect(founder.status === 'SUSPENDED' || founder.deactivatedAt ? '/account/reactivate' : returnTo);
  } else if ((await getUnifiedSession())?.organizerId) {
    // They have an organizer account, yet the portal turned them away: it's paused, not missing. Don't loop.
    return <WorkspaceSetupClient workspace={workspace} returnTo={returnTo} loginHref={loginHref} blocked />;
  }

  return <WorkspaceSetupClient workspace={workspace} returnTo={returnTo} loginHref={loginHref} />;
}

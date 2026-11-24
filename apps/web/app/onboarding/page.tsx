import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getUserSession } from '@/lib/user-session';
import { sql } from '@/lib/db';
import { safeReturnPath } from '@/lib/safe-return';
import { isPortalPath } from '@/lib/csp';
import OnboardingClient from './OnboardingClient';
import { getJobCategoryCounts } from '@/lib/jobs/search';
import { JOB_CATEGORIES } from '@/lib/jobs/composer';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await getUserSession();
  if (!session) {
    redirect('/auth/login');
  }

  const params = await searchParams;
  const returnTo = safeReturnPath(params.returnTo, '/'); // a path on this site only, never another site

  const users = await sql`
    SELECT "onboardingCompleted" FROM "WebUser" WHERE id = ${session.id} LIMIT 1
  `;

  // Already done: go where they were headed, except a portal. Portals open only when the person chooses, so the
  // page stays and shows its "open the portal?" screen (saving the choices re-renders this page, too).
  const finished = users.length > 0 && !!users[0].onboardingCompleted;
  // Rendering as part of the Finish/Skip save itself: the open page decides where to go next (it knows the job role
  // and shows the portal offer), so don't redirect from under it.
  const duringSave = (await headers()).has('next-action');
  if (finished && !duringSave && !isPortalPath(returnTo.split(/[?#]/)[0])) {
    redirect(returnTo);
  }

  // Every role, most open jobs first, so the first ones shown are the ones they can apply to today.
  const counts = new Map((await getJobCategoryCounts().catch(() => [])).map((r) => [r.category, r.count]));
  const jobRoles = JOB_CATEGORIES.filter((c) => c.value !== 'OTHER')
    .map((c) => ({ value: c.value as string, label: c.label as string, count: counts.get(c.value) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <OnboardingClient
      jobRoles={jobRoles}
      returnTo={returnTo}
      userName={session.name}
      finished={finished}
    />
  );
}

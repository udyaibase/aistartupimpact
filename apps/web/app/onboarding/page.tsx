import { redirect } from 'next/navigation';
import { getUserSession } from '@/lib/user-session';
import { sql } from '@/lib/db';
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
  const returnTo = params.returnTo || '/';

  const users = await sql`
    SELECT "onboardingCompleted" FROM "WebUser" WHERE id = ${session.id} LIMIT 1
  `;

  if (users.length > 0 && users[0].onboardingCompleted) {
    redirect(returnTo);
  }

  const categories = await sql`
    SELECT id, name, slug, icon
    FROM "ToolCategory"
    WHERE level = 0 AND "isActive" = true
    ORDER BY "sortOrder", name
  `;

  // For people here for jobs: roles that have open jobs right now (so the first list they see isn't empty).
  const counts = new Map((await getJobCategoryCounts().catch(() => [])).map((r) => [r.category, r.count]));
  const jobRoles = JOB_CATEGORIES.filter((c) => c.value !== 'OTHER' && (counts.get(c.value) ?? 0) > 0)
    .map((c) => ({ value: c.value as string, label: c.label as string, count: counts.get(c.value) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <OnboardingClient
      jobRoles={jobRoles}
      categories={categories as { id: string; name: string; slug: string; icon: string | null }[]}
      returnTo={returnTo}
      userName={session.name}
    />
  );
}

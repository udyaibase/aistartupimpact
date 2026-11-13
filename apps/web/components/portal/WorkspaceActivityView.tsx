import Link from 'next/link';
import { History } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { workspaceActionsIn, type WorkspaceActivityCategory, type WorkspaceKind } from '@udyaibase/utils';
import WorkspaceActivityList from '@/components/portal/WorkspaceActivityList';

const PAGE_SIZE = 50;

function readLog(kind: WorkspaceKind, workspaceId: string, filter: WorkspaceActivityCategory | 'all', page: number) {
  return prisma.workspaceActivityLog.findMany({
    where: { workspace: kind, workspaceId, ...(filter === 'all' ? {} : { action: { in: workspaceActionsIn(kind, filter) } }) },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: { id: true, action: true, actorName: true, actorEmail: true, ipAddress: true, userAgent: true, metadata: true, createdAt: true },
  });
}

/**
 * The activity log page of an employer or event-host workspace. Always this workspace's entries: the id comes from
 * the session (the caller), never from the request. Filters by category, 50 per page.
 */
export default async function WorkspaceActivityView({ kind, workspaceId, basePath, params, workLabel, passwordHref, supportHref }: {
  kind: WorkspaceKind;
  workspaceId: string;
  basePath: string;
  params: { type?: string; page?: string };
  /** The "work" filter's label: "Jobs" or "Events". */
  workLabel: string;
  passwordHref: string;
  supportHref: string;
}) {
  const FILTERS: { key: WorkspaceActivityCategory | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'security', label: 'Sign-ins and security' },
    { key: 'team', label: 'Team' },
    { key: 'work', label: workLabel },
    { key: 'billing', label: 'Billing' },
  ];
  const filter = FILTERS.find((f) => f.key === params.type)?.key ?? 'all';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  // Whatever goes wrong reading the log (table not migrated yet, an outdated database client, a database blip),
  // the page still opens, showing the empty state instead of an error screen.
  let rows: Awaited<ReturnType<typeof readLog>> = [];
  try {
    rows = await readLog(kind, workspaceId, filter, page);
  } catch (err) {
    console.error('[workspace-activity] could not read the log', err instanceof Error ? err.message : err);
  }
  const hasMore = rows.length > PAGE_SIZE;
  const href = (type: string, p = 1) => {
    const q = new URLSearchParams();
    if (type !== 'all') q.set('type', type);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const pager = 'inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800';

  return (
    <div className="space-y-6 font-jakarta">
      <div>
        <h1 className="portal-title">Activity log</h1>
        <p className="portal-subtitle">
          Sign-ins and changes in this workspace, with who made them, kept for one year. Only owners and admins can see this page.
        </p>
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
        Don’t recognise something? <Link href={passwordHref} className="font-semibold underline">Change your password</Link>, remove anyone you don’t know from the team, and{' '}
        <Link href={supportHref} className="font-semibold underline">contact Support</Link> straight away.
      </p>

      <nav aria-label="Filter activity" className="flex gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key)}
            aria-current={filter === f.key ? 'page' : undefined}
            className={`shrink-0 inline-flex items-center min-h-[40px] px-3 rounded-lg border text-sm font-medium ${
              filter === f.key
                ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
                : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center text-center rounded-[14px] border border-dashed border-gray-300 dark:border-gray-700 px-6 py-10">
          <History className="w-8 h-8 text-gray-400" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{page > 1 ? 'No more activity' : 'Nothing here yet'}</p>
          <p className="mt-1 max-w-md text-sm text-gray-600 dark:text-gray-400">The next sign-in or change will show here. Activity from before this log was added isn’t included.</p>
        </div>
      ) : (
        <WorkspaceActivityList kind={kind} rows={rows.slice(0, PAGE_SIZE)} />
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between gap-3">
          {page > 1 ? <Link href={href(filter, page - 1)} className={pager}>Newer</Link> : <span />}
          {hasMore && <Link href={href(filter, page + 1)} className={pager}>Older</Link>}
        </div>
      )}
    </div>
  );
}

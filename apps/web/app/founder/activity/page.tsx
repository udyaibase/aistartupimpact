import Link from 'next/link';
import { History } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { requireFounderAuth } from '@/lib/founder-auth';
import ActivityList from '@/components/founder/ActivityList';
import { EmptyGuide } from '@/components/founder/Guidance';
import { actionsIn, type ActivityCategory } from '@/lib/founder/activity-display';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity log' };

const PAGE_SIZE = 50;
const FILTERS: { key: ActivityCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'security', label: 'Account and security' },
  { key: 'listings', label: 'Listings' },
  { key: 'team', label: 'Team' },
];

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  const session = await requireFounderAuth();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.type)?.key ?? 'all';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  // Always this founder's own entries: the id comes from the session, never from the request.
  const rows = await prisma.founderActivityLog.findMany({
    where: { founderId: session.userId, ...(filter === 'all' ? {} : { action: { in: actionsIn(filter) } }) },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: { id: true, action: true, ipAddress: true, userAgent: true, metadata: true, createdAt: true },
  });
  const hasMore = rows.length > PAGE_SIZE;
  const href = (type: string, p = 1) => {
    const q = new URLSearchParams();
    if (type !== 'all') q.set('type', type);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `/founder/activity?${s}` : '/founder/activity';
  };
  const pager = 'inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800';

  return (
    <div className="space-y-6 font-jakarta">
      <div>
        <h1 className="portal-title">Activity log</h1>
        <p className="portal-subtitle">
          Sign-ins and changes on your account, kept for one year. Authorised Udyaibase staff can open this log only to investigate a security issue.
        </p>
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
        Don’t recognise something? <Link href="/founder/settings" className="font-semibold underline">Change your password</Link> and{' '}
        <Link href="/founder/support" className="font-semibold underline">contact Support</Link> straight away.
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
        <EmptyGuide icon={History} title={page > 1 ? 'No more activity' : 'Nothing here yet'}>
          Your next sign-in or change will show here. Activity from before this log was added isn’t included.
        </EmptyGuide>
      ) : (
        <ActivityList rows={rows.slice(0, PAGE_SIZE)} />
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

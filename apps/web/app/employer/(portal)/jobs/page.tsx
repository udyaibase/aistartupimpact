import { listingScope } from '@/lib/employer/permissions';
import Link from 'next/link';
import { Plus, Briefcase } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import JobRowActions from '@/components/employer/jobs/JobRowActions';
import { daysUntil } from '@/lib/jobs/composer';
import { can } from '@/lib/employer/roles';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'OPEN', label: 'Open' },
  { key: 'DRAFT', label: 'Drafts' },
  { key: 'PAUSED', label: 'Paused' },
  { key: 'CLOSED', label: 'Closed' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const WORK_TYPE: Record<string, string> = { REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'On-site' };
const CLOSE_REASON: Record<string, string> = { EXPIRED: 'Closing date passed', FILLED: 'Filled', MANUAL: 'Closed' };

function fmt(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export default async function EmployerJobsPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePagePermission('jobs.view');
  const canManage = can(session.role, 'jobs.manage');

  const { tab: rawTab } = await props.searchParams;
  const now = new Date();

  const [counts, rows] = await Promise.all([
    prisma.jobBoardListing.groupBy({ by: ['status'], where: { ...listingScope(session), deletedAt: null }, _count: { _all: true } }),
    prisma.jobBoardListing.findMany({
      where: { ...listingScope(session), deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true, slug: true, title: true, status: true, workType: true, location: true, viewsCount: true,
        expiresAt: true, publishedAt: true, closedAt: true, moderationHold: true, approvalRequestedAt: true, approvalRequestedBy: true, publishedByName: true, publishedByEmail: true, promotedNewsletterAt: true, promotedSocialAt: true, promotedSocialUrl: true, closeReason: true, draftSavedAt: true, updatedAt: true,
        _count: { select: { Applications: { where: { withdrawnAt: null } } } },
      },
    }),
  ]);

  const count = (k: Tab) => counts.find((c) => c.status === k)?._count._all ?? 0;
  const tab: Tab = (TABS.some((t) => t.key === rawTab) ? rawTab : count('OPEN') || !count('DRAFT') ? 'OPEN' : 'DRAFT') as Tab;
  // An OPEN job past its date is effectively closed even before the nightly job updates its status.
  const effective = (r: (typeof rows)[number]) => (r.status === 'OPEN' && r.expiresAt && r.expiresAt <= now ? 'CLOSED' : r.status);
  const jobs = rows.filter((r) => effective(r) === tab);

  return (
    <div className="font-jakarta">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <div>
          <h1 className="portal-title">Jobs</h1>
          <p className="portal-subtitle">Post, edit, pause and close your roles.</p>
        </div>
        {canManage && <Link href="/employer/jobs/new" className="btn-brand gap-2 shrink-0"><Plus className="w-4 h-4" aria-hidden /> Post a job</Link>}
      </div>

      <nav aria-label="Job status" className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-4 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link key={t.key} href={`/employer/jobs?tab=${t.key}`} aria-current={active ? 'page' : undefined}
              className={`relative inline-flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-semibold shrink-0 ${active ? 'text-brand' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
              {t.label}
              <span className={`text-xs tabular-nums px-1.5 rounded-full ${active ? 'bg-brand/10' : 'bg-gray-100 dark:bg-gray-800'}`}>{rows.filter((r) => effective(r) === t.key).length}</span>
              {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-brand rounded-full" aria-hidden />}
            </Link>
          );
        })}
      </nav>

      {jobs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] px-4 py-10 text-center">
          <Briefcase className="w-8 h-8 text-gray-400 mx-auto mb-2" aria-hidden />
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">
            {{ OPEN: 'No open jobs', DRAFT: 'No drafts', PAUSED: 'No paused jobs', CLOSED: 'No closed jobs' }[tab]}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {tab === 'DRAFT' ? 'Drafts save automatically once you give a job a title.' : tab === 'OPEN' ? 'Post a job to start receiving candidates.' : 'Jobs you pause or close show up here.'}
          </p>
          {canManage && (tab === 'OPEN' || tab === 'DRAFT') && <Link href="/employer/jobs/new" className="btn-brand gap-2 mt-4"><Plus className="w-4 h-4" aria-hidden /> Post a job</Link>}
        </div>
      ) : (
        <ul className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] divide-y divide-gray-100 dark:divide-gray-800">
          {jobs.map((j) => {
            const status = effective(j) as Tab;
            const daysLeft = j.expiresAt ? daysUntil(j.expiresAt, now) : null;
            const line =
              status === 'DRAFT' ? `Saved ${fmt(j.draftSavedAt ?? j.updatedAt)}`
              : status === 'CLOSED' ? `${CLOSE_REASON[j.closeReason ?? ''] ?? 'Closed'}${j.closedAt ? ` · ${fmt(j.closedAt)}` : j.expiresAt ? ` · ${fmt(j.expiresAt)}` : ''}`
              : daysLeft != null ? (daysLeft <= 0 ? 'Closes today' : daysLeft === 1 ? 'Closes tomorrow' : `Closes in ${daysLeft} days`) : 'No closing date';
            return (
              <li key={j.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <Link href={canManage ? `/employer/jobs/${j.id}/edit` : `/employer/applications?job=${j.id}`} className="block text-[15px] font-semibold text-gray-900 dark:text-white hover:text-brand truncate">{j.title}</Link>
                  {(j.promotedNewsletterAt || j.promotedSocialAt) && (
                    <p className="mt-0.5 text-[12.5px] text-gray-600 dark:text-gray-400">
                      Promoted by Udyaibase: {[j.promotedNewsletterAt && `newsletter ${fmt(j.promotedNewsletterAt)}`, j.promotedSocialAt && `social ${fmt(j.promotedSocialAt)}`].filter(Boolean).join(' · ')}
                      {j.promotedSocialUrl && <> · <a href={j.promotedSocialUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 dark:text-white hover:underline">see post</a></>}
                    </p>
                  )}
                  {status === 'DRAFT' && j.approvalRequestedAt && (
                    <p className="mt-0.5 text-[12.5px] font-semibold text-blue-800 dark:text-blue-300">
                      Waiting for owner approval{j.approvalRequestedBy && j.approvalRequestedBy.toLowerCase() !== session.email.toLowerCase() ? ` · asked by ${j.approvalRequestedBy}` : ''}
                    </p>
                  )}
                  {j.moderationHold && status !== 'CLOSED' && (
                    <p className="mt-0.5 text-[12.5px] font-semibold text-amber-800 dark:text-amber-300">Hidden while we review reports about this job. We’ll email you if we need anything.</p>
                  )}
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate">
                    {[j.location, WORK_TYPE[j.workType]].filter(Boolean).join(' · ')}
                    {status !== 'DRAFT' && j.publishedByEmail && j.publishedByEmail.toLowerCase() !== session.email.toLowerCase() && <span> · by {j.publishedByName || j.publishedByEmail}</span>}
                    <span className={status !== 'DRAFT' && status !== 'CLOSED' && daysLeft != null && daysLeft <= 7 ? ' text-amber-700 dark:text-amber-400 font-semibold' : ''}> · {line}</span>
                  </p>
                </div>
                {status !== 'DRAFT' && (
                  <div className="hidden sm:flex items-center gap-5 text-right shrink-0">
                    <div><p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{j.viewsCount.toLocaleString('en-IN')}</p><p className="text-xs text-gray-500">views</p></div>
                    <Link href={`/employer/applications?job=${j.id}`} className="group">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums group-hover:text-brand">{j._count.Applications.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-500 group-hover:text-brand">candidates</p>
                    </Link>
                  </div>
                )}
                {status === 'DRAFT' && canManage && (
                  <Link href={`/employer/jobs/${j.id}/edit`} className="hidden sm:inline-flex min-h-[40px] items-center px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-gray-400">Continue</Link>
                )}
                {canManage && <JobRowActions jobId={j.id} title={j.title} status={status} renewable={daysLeft != null && daysLeft <= 14} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

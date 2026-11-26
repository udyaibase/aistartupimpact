'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { getJobsAction, toggleJobActiveAction, deleteJobAction, bulkJobAction, type BulkJobOp } from './actions';
import DataTable, { type BulkAction, type Column, type TableFilter } from '@/components/ui/DataTable';
import { ask } from '@/components/Ask';
import { notify } from '@/components/Toast';

/** Bulk actions: button label, past tense for the result line, and what to warn about for the ones that hide jobs. */
const BULK: Record<BulkJobOp, { label: string; done: string; confirm?: string }> = {
  open: { label: 'Open', done: 'opened' },
  pause: { label: 'Pause', done: 'paused', confirm: 'They disappear from the jobs page until opened again. Applications and candidates are kept.' },
  close: { label: 'Close', done: 'closed', confirm: 'They stop taking applications and leave the jobs page. You can open them again later.' },
  renew: { label: 'Renew +30 days', done: 'renewed' },
  feature: { label: 'Feature', done: 'featured' },
  unfeature: { label: 'Unfeature', done: 'unfeatured' },
  delete: { label: 'Delete', done: 'deleted', confirm: 'They are removed from the job board and the admin list. Only super admins can do this.' },
};
const BULK_ORDER: BulkJobOp[] = ['open', 'pause', 'close', 'renew', 'feature', 'unfeature', 'delete'];

interface Job {
  id: string;
  slug: string;
  title: string;
  category: string;
  workType: string;
  listingTier: string;
  isActive: boolean;
  status: 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED';
  moderationHold: boolean;
  expired: boolean;
  expiresAt: string | null;
  isFeatured: boolean;
  applicationsCount: number;
  viewsCount: number;
  publishedAt: string | null;
  createdAt: string;
  companyName: string;
}

const words = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '–');
/** What a visitor would find: one word for the job's real state. */
function stateOf(j: Job): string {
  if (j.moderationHold) return 'On review hold';
  if (j.expired) return 'Expired';
  if (j.status === 'PAUSED') return 'Paused';
  if (j.status === 'CLOSED') return 'Closed';
  if (j.status === 'DRAFT') return 'Draft';
  return j.isActive ? 'Live' : 'Inactive';
}
const STATE_STYLE: Record<string, string> = {
  Live: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  'On review hold': 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  Expired: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
};
const NEUTRAL = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–');

export default function AdminJobsBoardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    const res = await getJobsAction();
    if (res.success) setJobs((res.data || []) as Job[]);
    else notify(res.error || "Couldn't load jobs. Refresh to try again.", 'error');
    setLoading(false);
  }, []);
  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const toggleActive = async (job: Job) => {
    const res = await toggleJobActiveAction(job.id, !job.isActive);
    if (res.success) setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, isActive: !job.isActive } : j)));
    else notify(res.error || "Couldn't change the job. Try again.", 'error');
  };

  const remove = async (job: Job) => {
    if (!(await ask({ title: 'Delete job listing', message: `Delete “${job.title}” at ${job.companyName}? It is removed from the job board and the admin list. This can’t be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    const res = await deleteJobAction(job.id);
    if (res.success) { setJobs((prev) => prev.filter((j) => j.id !== job.id)); notify('Job deleted.', 'success'); }
    else notify(res.error || "Couldn't delete the job. Try again.", 'error');
  };

  const runBulk = async (rows: Job[], op: BulkJobOp) => {
    const res = await bulkJobAction(rows.map((r) => r.id), op);
    if (!res.success) { notify(res.error || "Couldn't update the jobs. Try again.", 'error'); return; }
    const done = BULK[op].done;
    notify(`${res.changed} job${res.changed === 1 ? '' : 's'} ${done}${res.skipped ? `, ${res.skipped} already ${done} or unchanged` : ''}.`, 'success');
    await fetchJobs();
  };

  const columns = useMemo<Column<Job>[]>(() => [
    {
      key: 'job', header: 'Job', sortValue: (j) => j.title, searchValue: (j) => `${j.title} ${j.companyName}`,
      cell: (j) => (
        <div className="min-w-[180px] max-w-xs">
          <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
            {j.isFeatured && <Star className="w-3.5 h-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}
            <span className="truncate">{j.title}</span>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{words(j.workType)} · {words(j.listingTier)} listing</p>
        </div>
      ),
    },
    { key: 'company', header: 'Company', sortValue: (j) => j.companyName, cell: (j) => j.companyName },
    { key: 'category', header: 'Category', sortValue: (j) => j.category, cell: (j) => words(j.category) },
    { key: 'views', header: 'Views', align: 'right', sortValue: (j) => j.viewsCount || 0, cell: (j) => (j.viewsCount || 0).toLocaleString('en-IN') },
    { key: 'applications', header: 'Applications', align: 'right', sortValue: (j) => j.applicationsCount || 0, cell: (j) => (j.applicationsCount || 0).toLocaleString('en-IN') },
    { key: 'published', header: 'Published', sortValue: (j) => (j.publishedAt ? new Date(j.publishedAt) : null), cell: (j) => <span className="whitespace-nowrap text-xs">{day(j.publishedAt)}</span> },
    {
      key: 'status', header: 'Status', sortValue: (j) => stateOf(j),
      cell: (j) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATE_STYLE[stateOf(j)] ?? NEUTRAL}`}>{stateOf(j)}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (j) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => toggleActive(j)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 whitespace-nowrap"
            aria-label={`${j.isActive ? 'Deactivate' : 'Activate'} ${j.title}`}>{j.isActive ? 'Deactivate' : 'Activate'}</button>
          <Link href={`/jobs-board/${j.id}/edit`} aria-label={`Edit ${j.title}`} title="Edit" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil className="w-4 h-4" aria-hidden /></Link>
          <a href={`/jobs/${j.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${j.title} on the site (new tab)`} title="View on site" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><ExternalLink className="w-4 h-4" aria-hidden /></a>
          <button onClick={() => remove(j)} aria-label={`Delete ${j.title}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const filters = useMemo<TableFilter<Job>[]>(() => {
    const unique = (pick: (j: Job) => string) => [...new Set(jobs.map(pick).filter(Boolean))].sort().map((v) => ({ value: v, label: words(v) }));
    return [
      { key: 'status', label: 'Status', options: ['Live', 'Inactive', 'Paused', 'Closed', 'Draft', 'Expired', 'On review hold'].map((v) => ({ value: v, label: v })), matches: (j, v) => stateOf(j) === v },
      { key: 'category', label: 'Category', options: unique((j) => j.category), matches: (j, v) => j.category === v },
      { key: 'tier', label: 'Listing', options: unique((j) => j.listingTier), matches: (j, v) => j.listingTier === v },
      { key: 'featured', label: 'Featured', options: [{ value: 'yes', label: 'Featured' }, { value: 'no', label: 'Not featured' }], matches: (j, v) => j.isFeatured === (v === 'yes') },
    ];
  }, [jobs]);

  const bulkActions = useMemo<BulkAction<Job>[]>(() => BULK_ORDER.map((op) => ({
    label: BULK[op].label,
    danger: op === 'delete',
    run: (rows) => runBulk(rows, op),
    confirm: BULK[op].confirm ? (n: number) => `${BULK[op].label} ${n} job${n === 1 ? '' : 's'}? ${BULK[op].confirm}` : undefined,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), []);

  const live = jobs.filter((j) => stateOf(j) === 'Live').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="portal-title">Job board</h1>
          <p className="portal-subtitle">{jobs.length.toLocaleString('en-IN')} listings, {live.toLocaleString('en-IN')} live on the site. Tick rows to open, pause, close, renew or feature several at once.</p>
        </div>
        <Link href="/jobs-board/new" className="btn-brand text-sm gap-2 shrink-0"><Plus className="w-4 h-4" aria-hidden /> Post job</Link>
      </div>

      <DataTable
        tableId="jobs-board"
        noun="jobs"
        rows={jobs}
        rowKey={(j) => j.id}
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search job title or company"
        empty={{ title: 'No job listings yet', description: 'Jobs posted by employers, or by you with Post job, appear here.' }}
      />
    </div>
  );
}

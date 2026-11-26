'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Star, Trash2 } from 'lucide-react';
import DataTable, { type BulkAction, type Column, type TableFilter } from '@/components/ui/DataTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { notify } from '@/components/Toast';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'FLAGGED';
type Result = { success: boolean; error?: string };

export interface Review {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus | string;
  proofImageUrl: string | null;
  createdAt: string;
  helpfulCount?: number;
  user: { name: string | null; email: string | null; avatar: string | null };
  /** The tool or startup the review is about. */
  subject: { name: string | null; slug: string | null };
}

export interface ReviewActions {
  updateStatus: (id: string, status: ReviewStatus) => Promise<Result>;
  remove: (id: string) => Promise<Result>;
  bulkUpdateStatus: (ids: string[], status: ReviewStatus) => Promise<Result>;
  bulkRemove: (ids: string[]) => Promise<Result>;
}

const STATUS_LABEL: Record<string, string> = { PENDING: 'Pending', APPROVED: 'Approved', FLAGGED: 'Flagged', REJECTED: 'Rejected' };
const STATUS_STYLE: Record<string, string> = {
  APPROVED: 'text-green-800 border-green-200 bg-green-50 dark:text-green-300 dark:border-green-800 dark:bg-green-900/20',
  FLAGGED: 'text-red-800 border-red-200 bg-red-50 dark:text-red-300 dark:border-red-800 dark:bg-red-900/20',
  PENDING: 'text-amber-800 border-amber-200 bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-900/20',
};

/**
 * Review moderation, shared by Tool reviews and Startup reviews (they were two copies of the same 300 lines).
 * `kind` names the thing reviewed; `publicBase` is where its public page lives, e.g. https://udyaibase.com/tools.
 */
export default function ReviewsTable({ kind, publicBase, initialReviews, actions }: {
  kind: 'tool' | 'startup'; publicBase: string; initialReviews: Review[]; actions: ReviewActions;
}) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Review | null>(null);

  const setStatus = async (review: Review, status: ReviewStatus) => {
    setBusyId(review.id);
    try {
      const res = await actions.updateStatus(review.id, status);
      if (res.success) setReviews((list) => list.map((r) => (r.id === review.id ? { ...r, status } : r)));
      else notify(res.error || "Couldn't update the review. Try again.", 'error');
    } finally { setBusyId(null); }
  };

  const removeOne = async (review: Review) => {
    setBusyId(review.id);
    try {
      const res = await actions.remove(review.id);
      if (res.success) { setReviews((list) => list.filter((r) => r.id !== review.id)); notify('Review deleted.', 'success'); }
      else notify(res.error || "Couldn't delete the review. Try again.", 'error');
    } finally { setBusyId(null); }
  };

  const bulkStatus = (status: ReviewStatus) => async (rows: Review[]) => {
    const ids = rows.map((r) => r.id);
    const res = await actions.bulkUpdateStatus(ids, status);
    if (res.success) {
      setReviews((list) => list.map((r) => (ids.includes(r.id) ? { ...r, status } : r)));
      notify(`${ids.length} review${ids.length === 1 ? '' : 's'} marked ${STATUS_LABEL[status].toLowerCase()}.`, 'success');
    } else notify(res.error || "Couldn't update the reviews. Try again.", 'error');
  };

  const bulkRemove = async (rows: Review[]) => {
    const ids = rows.map((r) => r.id);
    const res = await actions.bulkRemove(ids);
    if (res.success) { setReviews((list) => list.filter((r) => !ids.includes(r.id))); notify(`${ids.length} review${ids.length === 1 ? '' : 's'} deleted.`, 'success'); }
    else notify(res.error || "Couldn't delete the reviews. Try again.", 'error');
  };

  const subjectHeader = kind === 'tool' ? 'Tool' : 'Startup';

  const columns = useMemo<Column<Review>[]>(() => [
    {
      key: 'subject', header: subjectHeader, sortValue: (r) => r.subject.name, searchValue: (r) => r.subject.name ?? '',
      cell: (r) => (
        <div>
          {r.subject.slug ? (
            <a href={`${publicBase}/${r.subject.slug}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand inline-flex items-center gap-1 hover:underline">
              {r.subject.name} <ExternalLink className="w-3 h-3" aria-hidden /><span className="sr-only">(opens the public page in a new tab)</span>
            </a>
          ) : <span className="text-gray-600 dark:text-gray-400">Removed {kind}</span>}
        </div>
      ),
    },
    {
      key: 'author', header: 'Author', sortValue: (r) => r.user.name || r.user.email, searchValue: (r) => `${r.user.name ?? ''} ${r.user.email ?? ''}`,
      cell: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center font-semibold text-xs shrink-0 overflow-hidden">
            {r.user.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={r.user.avatar} alt="" className="w-full h-full object-cover" />
              : (r.user.name?.charAt(0).toUpperCase() || '?')}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">{r.user.name || 'Deleted account'}</p>
            {r.user.email && <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{r.user.email}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'rating', header: 'Rating and review', sortValue: (r) => r.rating, searchValue: (r) => `${r.title} ${r.body}`,
      cell: (r) => (
        <div className="max-w-md">
          <div className="flex items-center gap-0.5 mb-1" role="img" aria-label={`${r.rating} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300 dark:text-gray-700'}`} aria-hidden />)}
          </div>
          <p className="font-medium text-gray-900 dark:text-white">
            {r.title}
            {r.proofImageUrl && (
              <a href={r.proofImageUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center text-xs font-normal text-brand hover:underline">
                <ImageIcon className="w-3 h-3 mr-0.5" aria-hidden /> Proof
              </a>
            )}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3" title={r.body}>{r.body}</p>
          {(r.helpfulCount ?? 0) > 0 && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{r.helpfulCount} found this helpful</p>}
        </div>
      ),
    },
    {
      key: 'date', header: 'Written', sortValue: (r) => new Date(r.createdAt),
      // A fixed locale and time zone: the same text on the server and in the browser.
      cell: (r) => <span className="whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>,
    },
    {
      key: 'status', header: 'Status', sortValue: (r) => r.status,
      cell: (r) => (
        <label>
          <span className="sr-only">Status of the review by {r.user.name || 'a deleted account'}</span>
          <select
            value={r.status}
            onChange={(e) => setStatus(r, e.target.value as ReviewStatus)}
            disabled={busyId === r.id}
            className={`text-xs font-semibold pl-2.5 pr-7 py-1.5 rounded-full border cursor-pointer disabled:opacity-50 ${STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING}`}
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="FLAGGED">Flagged</option>
          </select>
        </label>
      ),
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (r) => (
        <button onClick={() => setDeleting(r)} disabled={busyId === r.id} aria-label={`Delete the review by ${r.user.name || 'a deleted account'}`}
          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50">
          <Trash2 className="w-4 h-4" aria-hidden />
        </button>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells use the latest handlers; only `busyId` changes how they look
  ], [busyId, publicBase, kind]);

  const filters: TableFilter<Review>[] = [
    { key: 'status', label: 'Status', options: [{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'FLAGGED', label: 'Flagged' }], matches: (r, v) => r.status === v },
    { key: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` })), matches: (r, v) => String(r.rating) === v },
  ];

  const bulkActions: BulkAction<Review>[] = [
    { label: 'Approve', run: bulkStatus('APPROVED') },
    { label: 'Flag', run: bulkStatus('FLAGGED') },
    { label: 'Delete', danger: true, run: bulkRemove, confirm: (n) => `Permanently delete ${n} review${n === 1 ? '' : 's'}? This can't be undone.` },
  ];

  return (
    <>
      <DataTable
        tableId={`${kind}-reviews`}
        noun="reviews"
        rows={reviews}
        rowKey={(r) => r.id}
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        searchPlaceholder={`Search ${kind}, author or review text`}
        empty={{ title: `No ${kind} reviews yet`, description: `Reviews people write about ${kind}s appear here to approve or flag.` }}
      />
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { const r = deleting; setDeleting(null); if (r) await removeOne(r); }}
        title="Delete review"
        message={deleting ? `Permanently delete the review “${deleting.title}” by ${deleting.user.name || 'a deleted account'}? This can't be undone.` : ''}
      />
    </>
  );
}

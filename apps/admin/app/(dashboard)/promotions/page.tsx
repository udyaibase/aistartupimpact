'use client';

import { notify } from '@/components/Toast';
import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { getPromotionQueueAction, markPromotedAction, type PromotionRow } from './actions';
import { askText } from '@/components/Ask';

const WEB = (process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com').replace(/\/$/, '');
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

export default function PromotionsPage() {
  const [rows, setRows] = useState<PromotionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const r = await getPromotionQueueAction();
    if (r.success) setRows(r.data); else { setError(r.error ?? 'Failed'); setRows([]); }
  };
  useEffect(() => { load(); }, []);

  async function mark(row: PromotionRow, channel: 'newsletter' | 'social', done: boolean) {
    let socialUrl: string | undefined;
    if (channel === 'social' && done) {
      const link = await askText({ title: 'Mark as shared on social', message: row.title, label: 'Link to the social post', placeholder: 'https://', confirmLabel: 'Mark shared' });
      if (link === null) return;
      socialUrl = link || undefined;
    }
    setBusy(`${row.id}:${channel}`);
    const r = await markPromotedAction({ id: row.id, channel, done, socialUrl });
    setBusy(null);
    if (r.success) load(); else notify(r.error);
  }

  const cell = (row: PromotionRow, channel: 'newsletter' | 'social') => {
    const at = channel === 'newsletter' ? row.newsletterAt : row.socialAt;
    const key = `${row.id}:${channel}`;
    return at ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 whitespace-nowrap">
        <Check className="w-3.5 h-3.5" aria-hidden /> {fmt(at)}
        {channel === 'social' && row.socialUrl && <a href={row.socialUrl} target="_blank" rel="noopener noreferrer" className="text-brand" aria-label="Open the social post (new tab)"><ExternalLink className="w-3 h-3" aria-hidden /></a>}
        <button onClick={() => mark(row, channel, false)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline" aria-label={`Undo ${channel} share for ${row.title}`}>Undo</button>
      </span>
    ) : (
      <button onClick={() => mark(row, channel, true)} disabled={busy === key} className="px-2.5 py-1 text-xs font-semibold rounded bg-brand/10 text-brand disabled:opacity-50">
        {busy === key ? <Loader2 className="w-3 h-3 animate-spin" aria-label="Saving" /> : 'Mark shared'}
      </button>
    );
  };

  const columns = useMemo<Column<PromotionRow>[]>(() => [
    {
      key: 'job', header: 'Job', sortValue: (r) => r.title, searchValue: (r) => r.title,
      cell: (r) => <a href={`${WEB}/jobs/${r.slug}`} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 dark:text-white hover:text-brand hover:underline">{r.title}<span className="sr-only"> (opens in a new tab)</span></a>,
    },
    {
      key: 'company', header: 'Company', sortValue: (r) => r.company, searchValue: (r) => r.company,
      cell: (r) => <>{r.company}<span className="block text-xs text-gray-600 dark:text-gray-400">Plan until {fmt(r.planEndsAt)}</span></>,
    },
    { key: 'published', header: 'Published', sortValue: (r) => (r.publishedAt ? new Date(r.publishedAt) : null), cell: (r) => fmt(r.publishedAt) },
    { key: 'closes', header: 'Closes', sortValue: (r) => (r.expiresAt ? new Date(r.expiresAt) : null), cell: (r) => fmt(r.expiresAt) },
    { key: 'newsletter', header: 'Newsletter', sortValue: (r) => (r.newsletterAt ? 1 : 0), cell: (r) => cell(r, 'newsletter') },
    { key: 'social', header: 'Social', sortValue: (r) => (r.socialAt ? 1 : 0), cell: (r) => cell(r, 'social') },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers; only `busy` changes how they look
  ], [busy]);

  const filters = useMemo<TableFilter<PromotionRow>[]>(() => [
    {
      key: 'shared', label: 'Sharing',
      options: [{ value: 'todo', label: 'Still to share' }, { value: 'done', label: 'Shared on both' }],
      matches: (r, v) => (!!r.newsletterAt && !!r.socialAt) === (v === 'done'),
    },
  ], []);
  const todo = (rows ?? []).filter((r) => !r.newsletterAt || !r.socialAt).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Premium promotions</h1>
        <p className="portal-subtitle">Open jobs from employers on an active Scale plan (or older Premium). Scale includes a newsletter mention and a social post for each role.{rows ? ` ${todo.toLocaleString('en-IN')} still to share.` : ''}</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <DataTable
        tableId="promotions"
        noun="jobs"
        rows={rows ?? []}
        rowKey={(r) => r.id}
        columns={columns}
        filters={filters}
        loading={rows === null}
        searchPlaceholder="Search job or company"
        empty={{ title: 'Nothing to promote right now', description: 'Open jobs from employers on a Scale plan appear here.' }}
      />
    </div>
  );
}

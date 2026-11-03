'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Megaphone } from 'lucide-react';
import { getPromotionQueueAction, markPromotedAction, type PromotionRow } from './actions';

const WEB = (process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com').replace(/\/$/, '');
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

export default function PromotionsPage() {
  const [rows, setRows] = useState<PromotionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'todo' | 'all'>('todo');

  const load = async () => {
    const r = await getPromotionQueueAction();
    if (r.success) setRows(r.data); else { setError(r.error ?? 'Failed'); setRows([]); }
  };
  useEffect(() => { load(); }, []);

  async function mark(row: PromotionRow, channel: 'newsletter' | 'social', done: boolean) {
    let socialUrl: string | undefined;
    if (channel === 'social' && done) socialUrl = prompt('Link to the social post (optional)') ?? undefined;
    setBusy(`${row.id}:${channel}`);
    const r = await markPromotedAction({ id: row.id, channel, done, socialUrl });
    setBusy(null);
    if (r.success) load(); else alert(r.error);
  }

  const shown = (rows ?? []).filter((r) => filter === 'all' || !r.newsletterAt || !r.socialAt);
  const cell = (row: PromotionRow, channel: 'newsletter' | 'social') => {
    const at = channel === 'newsletter' ? row.newsletterAt : row.socialAt;
    const key = `${row.id}:${channel}`;
    return at ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
        <Check className="w-3.5 h-3.5" /> {fmt(at)}
        {channel === 'social' && row.socialUrl && <a href={row.socialUrl} target="_blank" rel="noopener noreferrer" className="text-brand"><ExternalLink className="w-3 h-3" /></a>}
        <button onClick={() => mark(row, channel, false)} className="text-gray-400 hover:text-gray-600 underline">undo</button>
      </span>
    ) : (
      <button onClick={() => mark(row, channel, true)} disabled={busy === key} className="px-2.5 py-1 text-xs font-semibold rounded bg-brand/10 text-brand disabled:opacity-50">
        {busy === key ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark shared'}
      </button>
    );
  };

  return (
    <div className="space-y-5 font-jakarta">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Megaphone className="w-5 h-5 text-brand" /> Premium promotions</h1>
          <p className="text-xs text-gray-500 mt-0.5">Open jobs from employers on an active Scale plan (or older Premium). Scale includes a newsletter mention and a social post for each role.</p>
        </div>
        <div className="flex gap-1">
          {(['todo', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-lg ${filter === f ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{f === 'todo' ? 'To do' : 'All'}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800">
            {['Job', 'Company', 'Published', 'Closes', 'Newsletter', 'Social'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows === null ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-brand mx-auto" /></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">{rows.length ? 'All Premium roles have been shared.' : 'No Premium employers with open jobs right now.'}</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3"><a href={`${WEB}/jobs/${r.slug}`} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 dark:text-white hover:text-brand">{r.title}</a></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.company}<span className="block text-[11px] text-gray-400">Premium until {fmt(r.planEndsAt)}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmt(r.publishedAt)}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmt(r.expiresAt)}</td>
                <td className="px-4 py-3">{cell(r, 'newsletter')}</td>
                <td className="px-4 py-3">{cell(r, 'social')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

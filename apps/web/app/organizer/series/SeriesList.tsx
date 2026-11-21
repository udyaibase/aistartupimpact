'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Repeat } from 'lucide-react';

type Row = { id: string; slug: string; name: string; recurrence: unknown; _count: { events: number; followers: number } };
const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';

export default function SeriesList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/organizer/series').then((r) => r.json()).then((d) => setRows(d.success ? d.series : [])).catch(() => setRows([]));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/organizer/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Couldn’t create the series.'); setBusy(false); return; }
      // Stays "Creating…" until the new series page has opened.
      router.push(`/organizer/series/${d.id}`);
    } catch { setError('You seem to be offline. Try again.'); setBusy(false); }
  }

  return (
    <div className="font-jakarta max-w-3xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="portal-title">Series</h1>
          <p className="portal-subtitle">Group events that happen again and again. Each series gets a public page people can follow.</p>
        </div>
        {!creating && <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold shrink-0"><Plus className="w-4 h-4" aria-hidden /> New series</button>}
      </div>

      {creating && (
        <form onSubmit={create} className="mb-5 p-4 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <label htmlFor="series-name" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Series name</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="series-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Bengaluru AI Meetup" className={input} />
            <button type="submit" disabled={busy || name.trim().length < 3} className="inline-flex items-center justify-center gap-2 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {busy ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => { setCreating(false); setName(''); }} className="min-h-[40px] px-4 rounded-[10px] text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </form>
      )}

      {!rows ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…</p>
        : rows.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-[14px]">
            <Repeat className="w-6 h-6 mx-auto text-gray-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No series yet</p>
            <p className="mt-1 text-sm text-gray-500">Running a monthly meetup or a yearly summit? Make it a series so people can follow it.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/organizer/series/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-sm text-gray-500">{s._count.events} {s._count.events === 1 ? 'event' : 'events'} · {s._count.followers} {s._count.followers === 1 ? 'follower' : 'followers'}</p>
                  </div>
                  {!!s.recurrence && <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"><Repeat className="w-3 h-3" aria-hidden /> Repeats</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

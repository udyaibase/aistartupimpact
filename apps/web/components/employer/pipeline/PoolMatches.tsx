'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, UserPlus, X } from 'lucide-react';

/** On a job's board: "12 past applicants match this role", with Invite all. Hidden when there are none. */
export default function PoolMatches({ jobId, onDone }: { jobId: string; onDone: (msg: string) => void }) {
  const [data, setData] = useState<{ count: number; people: { id: string; fullName: string; currentTitle: string | null; appliedFor: string; score: number }[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/employer/jobs/${jobId}/pool-matches`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => alive && d && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, [jobId]);

  if (!data || data.count === 0 || hidden) return null;

  async function inviteAll() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employer/jobs/${jobId}/pool-matches`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { onDone(`Invited ${d.invited} past applicant${d.invited === 1 ? '' : 's'} to apply.`); setHidden(true); }
      else onDone(d.error || 'Couldn’t send invites.');
    } catch { onDone('You seem to be offline.'); }
    setBusy(false);
  }

  return (
    <div className="mb-3 rounded-[12px] border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-900/10 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <UserPlus className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" aria-hidden />
        <span className="text-gray-800 dark:text-gray-200"><strong>{data.count}</strong> past applicant{data.count === 1 ? '' : 's'} in your talent pool match{data.count === 1 ? 'es' : ''} this role</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:underline">{open ? 'Hide' : 'See who'}</button>
        <button type="button" onClick={inviteAll} disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] bg-emerald-700 hover:bg-emerald-800 text-white text-[13px] font-semibold disabled:opacity-60">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />} Invite all to apply
        </button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="w-8 h-8 flex items-center justify-center rounded-[8px] text-gray-500 hover:bg-white/70"><X className="w-4 h-4" aria-hidden /></button>
      </div>
      {open && (
        <ul className="mt-2 space-y-1">
          {data.people.slice(0, 20).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate"><span className="font-semibold text-gray-900 dark:text-white">{p.fullName}</span> <span className="text-gray-500">· {p.currentTitle ?? 'Applicant'} · applied for {p.appliedFor}</span></span>
              <span className="shrink-0 text-xs font-semibold text-emerald-800 dark:text-emerald-300 tabular-nums">{p.score}% match</span>
            </li>
          ))}
          {data.count > 20 && <li className="text-xs text-gray-500">and {data.count - 20} more. <Link href="/employer/talent" className="underline">Open the talent pool</Link></li>}
        </ul>
      )}
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">They agreed to hear about other roles. Each gets one email; nobody is invited twice.</p>
    </div>
  );
}

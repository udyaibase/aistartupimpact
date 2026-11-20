'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** The signed-in person's own switch for the Monday hiring report. Hidden for interviewers. */
export default function WeeklyReportToggle() {
  const [state, setState] = useState<{ on: boolean; available: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/employer/notifications').then((r) => r.json()).then((d) => setState({ on: !!d.weeklyReport, available: !!d.available })).catch(() => {});
  }, []);

  if (!state?.available) return null;

  async function toggle(on: boolean) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/employer/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weeklyReport: on }) });
      if (res.ok) setState((s) => (s ? { ...s, on } : s));
      else setError((await res.json().catch(() => ({}))).error || 'Couldn’t save.');
    } catch { setError('You seem to be offline.'); }
    setBusy(false);
  }

  return (
    <div className="card p-5 sm:p-6 mb-4 flex items-start justify-between gap-4">
      <div>
        <p className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Weekly hiring report</p>
        <p className="text-xs text-gray-400 font-jakarta mt-1">Monday 9:00 AM IST: new applicants, AI picks, who’s waiting, and your top 3 to review.</p>
        {error && <p role="alert" className="text-xs text-red-700 mt-1">{error}</p>}
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0 min-h-[44px]">
        <input type="checkbox" role="switch" aria-label="Weekly hiring report email" checked={state.on} disabled={busy} onChange={(e) => toggle(e.target.checked)} className="sr-only peer" />
        <span className="w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-700 peer-checked:bg-[#A50F15] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#A50F15]/40" aria-hidden />
        <span className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" aria-hidden />
        {busy && <Loader2 className="ml-2 w-4 h-4 animate-spin text-gray-400" aria-hidden />}
      </label>
    </div>
  );
}

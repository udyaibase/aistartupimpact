'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import ClosingNotice, { useClosingPreview } from '@/components/employer/jobs/ClosingNotice';

export interface FilledJob { id: string; title: string; positions: number; hired: number; closed?: boolean }

/**
 * Shown when the last opening is filled. When someone joined, the job has already closed itself (it stops taking
 * applications) and this only asks whether to send the "role closed" email to people still waiting. For older flows
 * where the job is still open, it offers to close it. Nobody is emailed without a choice here.
 */
export default function FilledPrompt({ jobs, onDone }: { jobs: FilledJob[]; onDone: (message: string) => void }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keepRef = useRef<HTMLButtonElement>(null);
  const job = jobs[i];
  const [notify, setNotify] = useState(true);
  const preview = useClosingPreview(job?.id ?? null);

  useEffect(() => { keepRef.current?.focus(); }, [i]);

  const next = (message: string) => {
    setError('');
    if (i + 1 < jobs.length) setI(i + 1); else onDone(message);
  };

  async function close() {
    setBusy(true);
    setError('');
    if (job.closed) {
      try {
        const res = notify ? await fetch(`/api/employer/jobs/${job.id}/closing-emails`, { method: 'POST' }) : null;
        const d = res ? await res.json().catch(() => ({})) : {};
        if (!res || res.ok) next(notify ? `${job.title}: ${d.emailed ?? 0} waiting candidate${d.emailed === 1 ? '' : 's'} told the role is closed.` : `${job.title} is closed.`);
        else setError(d.error || 'Couldn’t send the emails. Try again.');
      } catch { setError('You seem to be offline.'); }
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/employer/jobs/${job.id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close', reason: 'FILLED', notifyCandidates: notify }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) next(`${job.title} closed as filled.`);
      else setError(d.error || 'Couldn’t close the job. Try again.');
    } catch {
      setError('You seem to be offline. The job is still open.');
    }
    setBusy(false);
  }

  if (!job) return null;
  return (
    <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center bg-black/40 p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); next(''); } }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="filled-title" aria-describedby="filled-desc"
        className="w-full max-w-md rounded-[16px] bg-white dark:bg-gray-900 p-5 shadow-xl font-jakarta">
        <h2 id="filled-title" className="portal-dialog-title">{job.closed ? 'Filled and closed' : 'All positions filled'}</h2>
        <p id="filled-desc" className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
          {job.closed
            ? <>{job.hired} of {job.positions} joined <span className="font-semibold text-gray-900 dark:text-white">{job.title}</span>, so it’s closed and no longer takes applications. Tell the people still waiting?</>
            : <>You’ve hired {job.hired} of {job.positions} for <span className="font-semibold text-gray-900 dark:text-white">{job.title}</span>. Close the job so people stop applying?</>}
        </p>
        <ClosingNotice preview={preview} notify={notify} onNotify={setNotify} />
        {error && <p role="alert" className="mt-3 text-[13px] text-red-700 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button ref={keepRef} type="button" onClick={() => next('')} disabled={busy}
            className="min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            {job.closed ? 'Not now' : 'Keep it open'}
          </button>
          <button type="button" onClick={close} disabled={busy}
            className="min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {job.closed ? (notify ? 'Send the emails' : 'Done') : 'Close as filled'}
          </button>
        </div>
      </div>
    </div>
  );
}

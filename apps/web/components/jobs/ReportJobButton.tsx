'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Flag, Loader2, X } from 'lucide-react';
import { JOB_REPORT_REASONS } from '@/lib/jobs/report-reasons';

/** "Report this job" link and dialog on the public job page. */
export default function ReportJobButton({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) { setError('Choose a reason.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(slug)}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, details, email }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setDone(true);
      else setError(d.error || 'Couldn’t send the report. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 min-h-[36px] text-xs font-semibold font-jakarta text-gray-600 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-400">
        <Flag className="w-3.5 h-3.5" aria-hidden /> Report this job
      </button>

      {open && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl font-jakarta max-h-[90vh] overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
              <h2 id="report-title" className="text-[15px] font-bold text-gray-900 dark:text-white">Report this job</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" aria-hidden /></button>
            </div>
            {done ? (
              <div className="p-6 text-center">
                <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-2" aria-hidden />
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Thanks, we’ll look into it</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Our team reviews every report. Jobs reported by several people are hidden until we’ve checked them.</p>
                <button type="button" onClick={() => setOpen(false)} className="mt-4 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">Done</button>
              </div>
            ) : (
              <form onSubmit={submit} className="p-5 space-y-4" noValidate>
                <p className="text-sm text-gray-600 dark:text-gray-400">“{title}”. Genuine employers never ask candidates to pay for a job.</p>
                <fieldset>
                  <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-2">What’s wrong?</legend>
                  <div className="space-y-1">
                    {JOB_REPORT_REASONS.map((r, i) => (
                      <label key={r.value} className="flex items-center gap-3 min-h-[40px] px-2 rounded-[8px] hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                        <input ref={i === 0 ? firstRef : undefined} type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="w-4 h-4 accent-[#A50F15]" />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="rep-details" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Details {reason === 'other' ? '' : <span className="font-normal text-gray-500">(optional)</span>}</label>
                  <textarea id="rep-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} className={`${input} py-2.5 resize-none`} placeholder="What happened?" />
                </div>
                <div>
                  <label htmlFor="rep-email" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Your email <span className="font-normal text-gray-500">(optional, if we need to ask more)</span></label>
                  <input id="rep-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
                </div>
                {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
                <button type="submit" disabled={busy} className="w-full min-h-[44px] rounded-[10px] bg-red-700 hover:bg-red-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Flag className="w-4 h-4" aria-hidden />} Send report
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

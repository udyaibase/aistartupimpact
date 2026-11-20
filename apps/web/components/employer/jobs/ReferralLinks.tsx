'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';

interface Data { code: string; referred: number; jobs: { id: string; title: string; link: string }[] }

/** "Refer someone": the signed-in teammate's personal link per open job. People who apply through it show as Referral. */
export default function ReferralLinks() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      try {
        const res = await fetch('/api/employer/referrals', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (res.ok) setData(d); else setError(d.error || 'Couldn’t load your links.');
      } catch { setError('You seem to be offline.'); }
    }
  }

  async function copy(id: string, link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(id); setTimeout(() => setCopied(null), 2000); } catch { setError('Copy failed. Select the link and copy it.'); }
  }

  return (
    <section className="mb-4 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left">
        <span className="w-9 h-9 rounded-[10px] bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0"><Share2 className="w-4 h-4 text-emerald-700 dark:text-emerald-300" aria-hidden /></span>
        <span className="flex-1 min-w-0">
          <span className="block portal-item-title">Refer someone you know</span>
          <span className="block text-[13px] text-gray-500 dark:text-gray-400">Your personal link for each open job. People who apply through it show as referred by you.</span>
        </span>
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-4">
          {!data ? (
            error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />
          ) : data.jobs.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No open jobs to share yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.jobs.map((j) => (
                  <li key={j.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{j.title}</span>
                      <span className="block text-xs text-gray-500 truncate">{j.link}</span>
                    </span>
                    <button type="button" onClick={() => copy(j.id, j.link)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                      {copied === j.id ? <><Check className="w-3.5 h-3.5 text-green-600" aria-hidden /> Copied</> : <><Copy className="w-3.5 h-3.5" aria-hidden /> Copy link</>}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">{data.referred ? `${data.referred} ${data.referred === 1 ? 'person has' : 'people have'} applied through your links.` : 'Nobody has applied through your links yet.'}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

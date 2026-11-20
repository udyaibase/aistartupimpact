'use client';

import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { alertTitle, JOB_ALERT_CONSENT } from '@/lib/jobs/job-alert-text';

/** "Get these jobs by email": a weekly alert for the role and city the visitor is looking at. */
export default function JobAlertSignup({ category, city, remote, initialEmail = '', startOpen = false }: {
  category: string | null; city: string | null; remote: boolean;
  /** After applying: their email filled in and the form already open (they still tick consent and confirm by email). */
  initialEmail?: string; startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [email, setEmail] = useState(initialEmail);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  const title = alertTitle({ category, city, remoteOnly: remote });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy'); setError('');
    try {
      const res = await fetch('/api/jobs/alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent, website, category, city, remoteOnly: remote }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setState('done'); else { setState('idle'); setError(d.error || 'Something went wrong.'); }
    } catch { setState('idle'); setError('You seem to be offline.'); }
  }

  if (state === 'done') {
    return (
      <p role="status" className="mb-4 rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-900 dark:text-green-200 font-jakarta">
        Check your inbox: click the link we sent to turn on “{title}”.
      </p>
    );
  }
  return (
    <div className="mb-4 card p-4 font-jakarta">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center gap-3 text-left">
          <BellRing className="w-5 h-5 text-brand shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-navy dark:text-white">Get new {title} by email</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">Once a week, only when there’s something new.</span>
          </span>
          <span className="text-sm font-semibold text-brand">Set up</span>
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm font-semibold text-navy dark:text-white">Weekly alert: {title}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="ja-email" className="sr-only">Email</label>
            <input id="ja-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
              className="flex-1 min-h-[44px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white" />
            <button type="submit" disabled={state === 'busy' || !consent} className="btn-brand gap-2 justify-center min-h-[44px] disabled:opacity-60">
              {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Create alert
            </button>
          </div>
          <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
          <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#A50F15]" />
            {JOB_ALERT_CONSENT}
          </label>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        </form>
      )}
    </div>
  );
}

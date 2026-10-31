'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type Confirm = null | 'withdraw' | 'delete';

export default function ApplicationActions({ token, withdrawn, jobSlug }: { token: string; withdrawn: boolean; jobSlug: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState(false);

  async function run(action: 'withdraw' | 'delete') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/applications/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        referrerPolicy: 'no-referrer',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Something went wrong. Try again.'); setBusy(false); return; }
      setConfirm(null);
      if (action === 'delete') setDeleted(true);
      else router.refresh();
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  if (deleted) {
    return (
      <div role="status" className="mt-6 rounded-[14px] border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-900/40 p-5">
        <p className="font-semibold text-gray-900 dark:text-white">Your data has been deleted</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">We removed your details and resume. This link no longer works.</p>
        <Link href="/jobs" className="btn-brand mt-4">Browse AI jobs</Link>
      </div>
    );
  }

  const btn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] text-sm font-semibold';

  return (
    <section aria-label="Manage your application" className="mt-6 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Link href={`/jobs/${jobSlug}`} className={`${btn} border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800`}>View job</Link>
        {!withdrawn && (
          <button type="button" onClick={() => setConfirm('withdraw')} className={`${btn} border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800`}>
            Withdraw application
          </button>
        )}
        <button type="button" onClick={() => setConfirm('delete')} className={`${btn} text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}>
          Delete my data
        </button>
      </div>

      {confirm && (
        <div role="alertdialog" aria-labelledby="confirm-title" className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <p id="confirm-title" className="font-semibold text-gray-900 dark:text-white">
            {confirm === 'withdraw' ? 'Withdraw this application?' : 'Delete your data?'}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
            {confirm === 'withdraw'
              ? 'The company won’t be able to move it forward. You can’t undo this.'
              : 'We’ll permanently delete your details and resume, and withdraw the application. You can’t undo this.'}
          </p>
          <div className="flex gap-2 mt-4">
            <button type="button" autoFocus onClick={() => setConfirm(null)} className={`${btn} text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800`}>Cancel</button>
            <button type="button" onClick={() => run(confirm)} disabled={busy}
              className={`${btn} text-white ${confirm === 'delete' ? 'bg-red-700 hover:bg-red-800' : 'bg-gray-900 hover:bg-gray-800'} disabled:opacity-60`}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {confirm === 'withdraw' ? 'Withdraw' : 'Delete permanently'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}

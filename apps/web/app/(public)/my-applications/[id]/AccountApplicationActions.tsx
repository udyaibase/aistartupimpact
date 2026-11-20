'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** View job, withdraw, delete for a signed-in job seeker (being signed in is the proof, so no email code). */
export default function AccountApplicationActions({ id, canWithdraw, jobHref, jobLabel }: { id: string; canWithdraw: boolean; jobHref: string; jobLabel: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<'withdraw' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (!confirm) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/user/applications/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: confirm }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Something went wrong.'); setBusy(false); return; }
      if (confirm === 'delete') { router.push('/my-applications'); router.refresh(); return; }
      setConfirm(null);
      router.refresh();
    } catch { setError('You seem to be offline.'); }
    setBusy(false);
  }

  const btn = 'inline-flex items-center justify-center min-h-[44px] px-4 rounded-md text-sm font-semibold';
  return (
    <div className="mt-4">
      {confirm ? (
        <div role="alertdialog" aria-label={confirm === 'withdraw' ? 'Withdraw this application?' : 'Delete your data?'} className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{confirm === 'withdraw' ? 'Withdraw this application?' : 'Delete your data for this application?'}</p>
          <p className="text-[13px] text-gray-700 dark:text-gray-300 mt-0.5">{confirm === 'withdraw' ? 'The company won’t be able to move it forward. You can’t undo this.' : 'We’ll permanently delete your details and resume for it, and withdraw it. You can’t undo this.'}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" autoFocus onClick={() => setConfirm(null)} className={`${btn} text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800`}>Cancel</button>
            <button type="button" onClick={run} disabled={busy} className={`${btn} gap-2 text-white disabled:opacity-60 ${confirm === 'delete' ? 'bg-red-700 hover:bg-red-800' : 'bg-gray-900 hover:bg-gray-800'}`}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}{confirm === 'withdraw' ? 'Withdraw' : 'Delete permanently'}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </div>
      ) : (
        // Phones: the two buttons share a row, delete sits under them; wider screens: one row.
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Link href={jobHref} className={`${btn} border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800`}>{jobLabel}</Link>
          {canWithdraw && <button type="button" onClick={() => setConfirm('withdraw')} className={`${btn} border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800`}><span className="sm:hidden">Withdraw</span><span className="hidden sm:inline">Withdraw application</span></button>}
          <button type="button" onClick={() => setConfirm('delete')} className={`${btn} col-span-2 justify-self-start !px-1 sm:!px-4 text-red-700 dark:text-red-400 hover:underline`}>Delete my data</button>
        </div>
      )}
    </div>
  );
}

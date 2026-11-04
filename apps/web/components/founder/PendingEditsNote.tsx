'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { cancelPendingEditAction } from '@/app/founder/listing-actions';

type Edit = { id: string; label: string; value: string; by: string };

/** What's waiting for our team, with the value that will go live, and a way to take it back. */
export default function PendingEditsNote({ edits }: { edits: Edit[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (edits.length === 0) return null;

  const cancel = async (id: string) => {
    setBusy(id); setError('');
    const result = await cancelPendingEditAction(id).catch(() => ({ success: false }));
    if (result.success) router.refresh();
    else setError('Couldn’t cancel that change. Please try again.');
    setBusy(null);
  };

  return (
    <section aria-labelledby="pending-edits-title" className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-[14px] p-4 font-jakarta">
      <h2 id="pending-edits-title" className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <Clock className="w-4 h-4" aria-hidden /> Waiting for our team
      </h2>
      <p className="text-sm text-amber-900/90 dark:text-amber-200/90 mt-1">Your listing keeps showing the current version until these are approved.</p>
      <ul className="mt-3 space-y-2">
        {edits.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 bg-white/70 dark:bg-gray-900/40 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{e.label}{e.by && <span className="font-normal text-gray-600 dark:text-gray-400"> · {e.by}</span>}</p>
              <p className="text-[13px] text-gray-700 dark:text-gray-300 break-words line-clamp-2">{e.value}</p>
            </div>
            <button onClick={() => cancel(e.id)} disabled={busy === e.id} className="shrink-0 min-h-[40px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline disabled:opacity-60">Cancel</button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400 mt-2">{error}</p>}
    </section>
  );
}

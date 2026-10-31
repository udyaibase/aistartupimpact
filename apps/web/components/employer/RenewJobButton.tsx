'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Extends a job's closing date by 30 days (and reopens it if it had closed). */
export default function RenewJobButton({ jobId, title }: { jobId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function renew() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/employer/jobs/${jobId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renew' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) router.refresh();
      else setError(data.error || "Couldn't renew. Try again.");
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={renew}
        disabled={busy}
        aria-label={`Renew ${title} for 30 days`}
        className="inline-flex items-center gap-1 min-h-[32px] text-[13px] font-semibold text-brand hover:underline disabled:opacity-60"
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
        Renew
      </button>
      {error && <span role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}

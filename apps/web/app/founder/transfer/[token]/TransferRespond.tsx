'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { respondTransferAction } from '@/app/founder/startups/transfer-actions';

export default function TransferRespond({ token, atLimit, limitMessage }: { token: string; atLimit: boolean; limitMessage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState('');
  const [declined, setDeclined] = useState(false);

  const respond = async (accept: boolean) => {
    if (busy) return;
    setBusy(accept ? 'accept' : 'decline');
    setError('');
    const r = await respondTransferAction(token, accept);
    setBusy(null);
    if (!r.success) { setError(r.error); return; }
    if (!accept) { setDeclined(true); return; }
    router.replace(r.slug ? `/founder/startups/${r.slug}` : '/founder/startups');
  };

  if (declined) return <p role="status" className="text-sm text-gray-700 dark:text-gray-300">Declined. Nothing changed, and the owner has been told.</p>;

  return (
    <div>
      {atLimit && <p className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">{limitMessage}</p>}
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={() => respond(true)} disabled={!!busy || atLimit} className="btn-brand h-11 px-5 justify-center gap-2 disabled:opacity-50">
          {busy === 'accept' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Accept and become owner
        </button>
        <button type="button" onClick={() => respond(false)} disabled={!!busy} className="h-11 px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          {busy === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

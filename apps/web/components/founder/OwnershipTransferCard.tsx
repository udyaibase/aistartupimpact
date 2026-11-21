'use client';

import { useState } from 'react';
import { Loader2, Send, UserRoundCog } from 'lucide-react';
import { cancelTransferAction, startTransferAction } from '@/app/founder/startups/transfer-actions';

type Pending = { id: string; toEmail: string; expiresAt: string } | null;

/** Owner only: hand the startup to another founder. They accept from an emailed link. */
export default function OwnershipTransferCard({ startupId, startupName, pending: initial }: { startupId: string; startupName: string; pending: Pending }) {
  const [pending, setPending] = useState<Pending>(initial);
  const [email, setEmail] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    const r = await startTransferAction(startupId, email);
    setBusy(false);
    if (!r.success) { setError(r.error); return; }
    setPending({ id: r.id ?? '', toEmail: email.trim().toLowerCase(), expiresAt: r.expiresAt ?? new Date(Date.now() + 7 * 86_400_000).toISOString() });
    setNote('Link sent. You stay the owner until they accept.');
    setConfirming(false);
    setEmail('');
  };

  const cancel = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    const r = pending.id ? await cancelTransferAction(pending.id) : { success: false as const, error: 'Refresh the page to cancel this transfer.' };
    setBusy(false);
    if (!r.success) { setError(r.error); return; }
    setPending(null);
    setNote('Transfer cancelled.');
  };

  return (
    <div className="card -mx-4 sm:mx-0 rounded-none sm:rounded-[14px] border-x-0 sm:border-x px-4 py-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-sora font-bold text-sm text-navy dark:text-white mb-1">
        <UserRoundCog className="w-4 h-4" aria-hidden /> Transfer ownership
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Hand {startupName} to someone else, for example a co-founder. They accept from a link we email them, signed in with that email. You lose owner access once they accept.
      </p>

      {pending ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
            Waiting for <strong>{pending.toEmail}</strong> to accept. The link expires {new Date(pending.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.
          </p>
          <button type="button" onClick={cancel} disabled={busy} className="h-10 px-4 rounded-lg border border-amber-300 dark:border-amber-700 text-sm font-semibold text-amber-900 dark:text-amber-200 disabled:opacity-50">
            Cancel transfer
          </button>
        </div>
      ) : !confirming ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="transferEmail" className="sr-only">New owner’s email</label>
          <input
            id="transferEmail"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="New owner’s email"
            className="flex-1 h-11 px-3.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          />
          <button type="button" onClick={() => setConfirming(true)} disabled={!email.trim()} className="h-11 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            Continue
          </button>
        </div>
      ) : (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10">
          <p className="text-sm text-red-900 dark:text-red-200 mb-3">
            Send a transfer link to <strong>{email.trim()}</strong>? When they accept, they become the owner of {startupName} and you lose owner access.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={busy} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send transfer link
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 px-4 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              Back
            </button>
          </div>
        </div>
      )}

      {note && <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-400">{note}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

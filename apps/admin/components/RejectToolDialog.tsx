'use client';

import { useState } from 'react';

/** Asks for the reason a tool is being rejected. The reason is emailed to the founder, so it's required. */
export default function RejectToolDialog({ toolName, onCancel, onReject }: {
  toolName: string;
  onCancel: () => void;
  /** Resolves with an error message to show, or nothing when the tool was rejected. */
  onReject: (reason: string) => Promise<string | void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!reason.trim()) { setError('Add a reason. The founder receives it by email.'); return; }
    setBusy(true); setError('');
    const failed = await onReject(reason.trim());
    setBusy(false);
    if (failed) setError(failed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-tool-title">
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 id="reject-tool-title" className="text-lg font-semibold text-gray-900 dark:text-white">Reject “{toolName}”</h2>
        <label htmlFor="reject-tool-reason" className="block text-sm text-gray-600 dark:text-gray-400 mt-1 mb-2">
          Tell the founder what to fix. We’ll email this to them, and they can edit and resubmit.
        </label>
        <textarea
          id="reject-tool-reason"
          autoFocus
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm p-3"
        />
        {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold">{busy ? 'Rejecting…' : 'Reject and email founder'}</button>
        </div>
      </div>
    </div>
  );
}

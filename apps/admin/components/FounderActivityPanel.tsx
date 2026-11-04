'use client';

import { useState } from 'react';
import { describeActivity, describeDevice } from '@udyaibase/utils';

type Entry = { id: string; action: string; ipAddress: string | null; userAgent: string | null; metadata: unknown; createdAt: string };

/** Super Admin only: a founder's activity log, opened with a written reason that goes in the audit log. */
export default function FounderActivityPanel({ founderId }: { founderId: string }) {
  const [reason, setReason] = useState('');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetState, setResetState] = useState<'idle' | 'open' | 'busy' | 'done'>('idle');
  const [resetError, setResetError] = useState('');

  const open = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/admin/founders/${founderId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEntries(data.entries);
      else setError(data.error || 'Couldn’t load this log. Try again.');
    } catch {
      setError('Couldn’t load this log. Check your connection and try again.');
    }
    setBusy(false);
  };

  const resetTwoFactor = async () => {
    setResetState('busy'); setResetError('');
    const res = await fetch(`/api/admin/founders/${founderId}/two-factor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: resetReason }),
    }).catch(() => null);
    if (res?.ok) { setResetState('done'); return; }
    setResetError((await res?.json().catch(() => null))?.error || 'Couldn’t turn it off. Try again.');
    setResetState('open');
  };

  return (
    <section aria-labelledby="founder-activity-title" className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <h2 id="founder-activity-title" className="text-lg font-semibold text-gray-900 dark:text-white">Security activity log</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        Includes IP addresses, so open it only to investigate a security issue. Your name and reason are saved in the audit log.
      </p>

      {entries === null ? (
        <form onSubmit={open} className="mt-4">
          <label htmlFor="activity-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Why do you need this log?</label>
          <textarea
            id="activity-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: founder reported a sign-in they don’t recognise, ticket ST-123"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm p-3"
          />
          {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
          <button type="submit" disabled={busy || reason.trim().length < 10} className="mt-3 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
            {busy ? 'Opening…' : 'Open log'}
          </button>
        </form>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">No activity recorded for this founder.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
          {entries.map((row) => {
            const when = new Date(row.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
            const details = [when, describeDevice(row.userAgent), row.ipAddress && row.ipAddress !== 'unknown' ? `IP ${row.ipAddress}` : null].filter(Boolean);
            return (
              <li key={row.id} className="py-2.5">
                <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{describeActivity(row.action, row.metadata).title}</p>
                <p className="text-[13px] text-gray-600 dark:text-gray-400 break-words">{details.join(' · ')}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Lost two-factor access</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">For someone who’s lost their phone and backup codes. Confirm who they are first. They’ll be told by email.</p>
        {resetState === 'done' ? (
          <p role="status" className="text-sm font-semibold text-gray-900 dark:text-white mt-3">Two-factor sign-in is off, and the founder has been emailed.</p>
        ) : resetState === 'idle' ? (
          <button onClick={() => setResetState('open')} className="mt-3 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">Turn off two-factor sign-in</button>
        ) : (
          <div className="mt-3">
            <label htmlFor="reset-2fa-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">How did you confirm this person?</label>
            <textarea id="reset-2fa-reason" rows={2} value={resetReason} onChange={(e) => setResetReason(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm p-3" />
            {resetError && <p role="alert" className="text-sm text-red-600 mt-2">{resetError}</p>}
            <button onClick={resetTwoFactor} disabled={resetState === 'busy' || resetReason.trim().length < 10} className="mt-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Turn it off</button>
          </div>
        )}
      </div>
    </section>
  );
}

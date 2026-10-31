'use client';

import { useState } from 'react';

/** Candidate control for "contact me about other roles" (12 months). */
export default function TalentPoolToggle({ token, company, on: initial }: { token: string; company: string; on: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle(next: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/applications/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, referrerPolicy: 'no-referrer',
        body: JSON.stringify({ action: next ? 'pool_on' : 'pool_off' }),
      });
      if (res.ok) setOn(next);
      else setError('Couldn’t save that. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  return (
    <div className="mt-6 rounded-[14px] border border-gray-200 dark:border-gray-800 p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[#A50F15]" />
        <span>
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">Let {company} contact me about other roles</span>
          <span className="block text-[13px] text-gray-600 dark:text-gray-400">For 12 months. Turn it off and your details are deleted on the normal schedule.</span>
        </span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

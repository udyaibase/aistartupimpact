'use client';

import { useState } from 'react';
import { ArrowRight, Briefcase, Loader2 } from 'lucide-react';

/** Hiring teams the signed-in person was invited to (by email); opens them without a second sign-in. */
export default function HiringMemberships({ workspaces }: { workspaces: { memberId: string; startup: string; roleLabel: string }[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function open(memberId: string) {
    setBusy(memberId);
    setError('');
    try {
      const res = await fetch('/api/founder/hiring/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.redirect) { window.location.href = d.redirect; return; }
      setError(d.error || 'Couldn’t open hiring. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(null);
  }

  return (
    <section aria-labelledby="memberships-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5">
      <h2 id="memberships-title" className="portal-section-title">Hiring teams you’re on</h2>
      <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">You were invited to help with hiring. Open a workspace without signing in again.</p>
      <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
        {workspaces.map((w) => (
          <li key={w.memberId} className="flex items-center gap-3 py-2.5">
            <Briefcase className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white truncate"><span className="font-semibold">{w.startup}</span> · {w.roleLabel}</span>
            <button type="button" onClick={() => open(w.memberId)} disabled={busy !== null}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              {busy === w.memberId ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null} Open <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}

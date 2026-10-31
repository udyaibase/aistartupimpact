'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function JoinForm({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/employer/team/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name }),
        referrerPolicy: 'no-referrer',
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.redirect) { window.location.href = d.redirect; return; }
      setError(d.error || 'Couldn’t join. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
      <div>
        <label htmlFor="join-name" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Your name</label>
        <input id="join-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} placeholder="e.g. Priya Sharma"
          className="w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]"
          aria-invalid={!!error || undefined} aria-describedby={error ? 'join-error' : undefined} />
        <p className="mt-1 text-xs text-gray-500">Teammates see this on notes and mentions.</p>
      </div>
      {error && <p id="join-error" role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy || name.trim().length < 2} className="btn-brand w-full gap-2 disabled:opacity-50">
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Join team
      </button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { InviteEmail } from '@/components/invite/InviteFrame';
import { CONTROL_FIELD, CONTROL_LABEL, CONTROL_PRIMARY } from '@/lib/ui/form-controls';

export default function JoinForm({ token, email }: { token: string; email: string }) {
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
    <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
      <InviteEmail email={email} />
      <div>
        <label htmlFor="join-name" className={CONTROL_LABEL}>Full name</label>
        <input id="join-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} placeholder="Your name"
          className={CONTROL_FIELD} aria-invalid={!!error || undefined} aria-describedby={error ? 'join-error' : 'join-name-hint'} />
        <p id="join-name-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">Teammates see this on notes and mentions. No password needed: you’ll sign in with an email code.</p>
      </div>
      {error && <p id="join-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="pt-2">
        <button type="submit" disabled={busy || name.trim().length < 2} className={CONTROL_PRIMARY}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {busy ? 'Joining…' : 'Join team'}
        </button>
      </div>
    </form>
  );
}

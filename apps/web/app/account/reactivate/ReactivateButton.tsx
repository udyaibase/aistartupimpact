'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function ReactivateButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reactivate = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/founder/reactivate', { method: 'POST' });
      if (res.ok) { window.location.href = '/founder/dashboard'; return; }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Couldn’t reactivate your account. Please try again.');
    } catch {
      setError('Couldn’t reactivate your account. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <button onClick={reactivate} disabled={busy} className="btn-brand gap-2 mt-4 w-full">
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Reactivate my account
      </button>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400 mt-3">{error}</p>}
    </>
  );
}

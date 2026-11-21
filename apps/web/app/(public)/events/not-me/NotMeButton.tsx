'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function NotMeButton({ token, alreadyDone }: { token: string; alreadyDone: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>(alreadyDone ? 'done' : 'idle');
  const [problem, setProblem] = useState('');
  if (state === 'done') return <p role="status" className="mt-5 text-sm font-medium text-green-700 dark:text-green-400">Done. The registration is cancelled and this address can’t be registered for events for now.</p>;
  return (
    <div className="mt-5">
      <button type="button" disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            const r = await fetch('/api/events/not-me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) });
            if (r.ok) return setState('done');
            setProblem((await r.json().catch(() => ({})))?.error || 'Something went wrong. Please try again.');
            setState('error');
          } catch { setProblem('Something went wrong. Please try again.'); setState('error'); }
        }}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60">
        {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} I didn’t register. Cancel it
      </button>
      {state === 'error' && <p role="alert" className="mt-2 text-sm text-red-600">{problem}</p>}
    </div>
  );
}

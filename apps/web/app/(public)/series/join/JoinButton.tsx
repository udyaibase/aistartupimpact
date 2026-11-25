'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function JoinButton({ token, alreadyFollowing, name }: { token: string; alreadyFollowing: boolean; name: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>(alreadyFollowing ? 'done' : 'idle');
  if (state === 'done') return <p role="status" className="mt-5 text-sm font-medium text-green-700 dark:text-green-400">You’re following {name}. We’ll email you when the next event opens.</p>;
  return (
    <div className="mt-5">
      <button type="button" disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            const r = await fetch('/api/series/follow/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) });
            setState(r.ok ? 'done' : 'error');
          } catch { setState('error'); }
        }}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60">
        {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Follow {name}
      </button>
      {state === 'error' && <p role="alert" className="mt-2 text-sm text-red-600">Something went wrong. Please try again.</p>}
    </div>
  );
}

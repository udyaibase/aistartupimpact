'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const stop = async () => {
    setState('busy');
    try {
      const res = await fetch(`/api/founder/email-preferences?token=${encodeURIComponent(token)}`, { method: 'POST' });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return <p role="status" className="text-sm font-semibold text-gray-900 dark:text-white mt-4">Done. You won’t get these emails any more. You can turn them back on in Settings.</p>;
  }
  return (
    <>
      <button onClick={stop} disabled={state === 'busy'} className="btn-brand gap-2 mt-4 w-full">
        {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Stop these emails
      </button>
      {state === 'error' && <p role="alert" className="text-sm text-red-700 dark:text-red-400 mt-3">That didn’t work. Please try again.</p>}
    </>
  );
}

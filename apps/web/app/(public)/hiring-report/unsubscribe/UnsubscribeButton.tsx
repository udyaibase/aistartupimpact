'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export default function UnsubscribeButton({ query }: { query: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  async function go() {
    setState('busy');
    try {
      const res = await fetch(`/api/employer/weekly-report/unsubscribe?${query}`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setState('done'); else { setState('error'); setMsg(d.error || 'Something went wrong.'); }
    } catch {
      setState('error'); setMsg('You seem to be offline.');
    }
  }
  if (state === 'done') {
    return (
      <p role="status" className="mt-6 text-gray-800 dark:text-gray-200">
        Done. You won’t get the weekly report any more. <Link href="/employer/settings" className="font-semibold underline">Settings</Link>
      </p>
    );
  }
  return (
    <div className="mt-6">
      <button type="button" onClick={go} disabled={state === 'busy'} className="btn-brand gap-2">
        {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Stop weekly reports
      </button>
      {state === 'error' && <p role="alert" className="mt-3 text-sm text-red-700">{msg}</p>}
    </div>
  );
}

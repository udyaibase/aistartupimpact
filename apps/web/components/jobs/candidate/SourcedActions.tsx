'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

/** Two buttons (a press, never a bare link, so email scanners can't trigger them). */
export default function SourcedActions({ token, interested, company }: { token: string; interested: boolean; company: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'interested' | 'removed'>(interested ? 'interested' : 'idle');
  const [error, setError] = useState('');
  async function act(action: 'interested' | 'remove') {
    if (action === 'remove' && !confirm('Remove your details from this team’s list? This can’t be undone.')) return;
    setState('busy'); setError('');
    const res = await fetch(`/api/sourced/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : { error: 'You seem to be offline.' };
    if (res?.ok) setState(action === 'interested' ? 'interested' : 'removed');
    else { setState('idle'); setError(d.error || 'Something went wrong. Try again.'); }
  }
  if (state === 'interested') return <p role="status" className="mt-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-200 text-sm"><Check className="inline w-4 h-4 mr-1" aria-hidden />Thanks! {company} knows you’re interested and will be in touch. You can also reply to their email.</p>;
  if (state === 'removed') return <p role="status" className="mt-6 p-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200">Your details have been removed. You won’t hear from {company} about this role again.</p>;
  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" disabled={state === 'busy'} onClick={() => act('interested')} className="btn-brand gap-2">{state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}I’m interested</button>
        <button type="button" disabled={state === 'busy'} onClick={() => act('remove')} className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">Remove my details</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

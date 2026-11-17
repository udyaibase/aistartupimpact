'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function FollowSeries({ slug, name }: { slug: string; name: string }) {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState('');

  if (state === 'sent') {
    return <p role="status" className="text-sm text-gray-700 dark:text-gray-300">Check your inbox and confirm. After that we’ll email you when the next {name} event opens.</p>;
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy'); setError('');
        try {
          const r = await fetch(`/api/series/${encodeURIComponent(slug)}/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, website }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { setError(d.error || 'Couldn’t follow. Please try again.'); setState('idle'); return; }
          setState('sent');
        } catch { setError('You seem to be offline.'); setState('idle'); }
      }}
    >
      <label htmlFor="follow-email" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Get an email when the next one opens</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input id="follow-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
          className="flex-1 min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand" />
        {/* Bots fill every field; people never see this one. */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" name="website" />
        <button type="submit" disabled={state === 'busy'} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60">
          {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Follow
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-gray-500">One email per new event. Stop any time.</p>
    </form>
  );
}

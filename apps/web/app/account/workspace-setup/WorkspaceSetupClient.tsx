'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

type State = { kind: 'working' } | { kind: 'message'; text: string; retry: boolean; signIn?: boolean };

const NAMES = { founder: 'founder portal', organizer: 'organizer portal' } as const;

export default function WorkspaceSetupClient({ workspace, returnTo, loginHref, blocked = false }: { workspace: 'founder' | 'organizer'; returnTo: string; loginHref: string; blocked?: boolean }) {
  const name = NAMES[workspace];
  const [state, setState] = useState<State>(blocked
    ? { kind: 'message', text: 'Your organizer account can’t be opened right now. Write to support@udyaibase.com and we’ll help.', retry: false }
    : { kind: 'working' });
  const started = useRef(false);

  const run = useCallback(async () => {
    setState({ kind: 'working' });
    try {
      const res = await fetch('/api/workspace/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return setState({ kind: 'message', text: 'Your sign-in has expired. Sign in again to continue.', retry: false, signIn: true });
      if (!res.ok || !data.success) return setState({ kind: 'message', text: data.error || `Couldn’t set up your ${name}. Try again.`, retry: true });
      if (data.status === 'confirmation_pending' || data.status === 'verification_required') {
        return setState({ kind: 'message', text: `${data.message} Open the link in that email, then come back here.`, retry: true });
      }
      // Founders set up their profile next (it then sends them on); organizers go straight in.
      window.location.replace(workspace === 'founder' ? `/founder/onboarding?returnTo=${encodeURIComponent(returnTo)}` : returnTo);
    } catch {
      setState({ kind: 'message', text: 'You seem to be offline. Check your connection and try again.', retry: true });
    }
  }, [returnTo, workspace]);

  useEffect(() => {
    if (started.current || blocked) return;
    started.current = true;
    void run();
  }, [run, blocked]);

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 bg-[#F7F7F8] dark:bg-gray-950 font-jakarta">
      <div className="w-full max-w-md rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6" aria-live="polite">
        {state.kind === 'working' ? (
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" aria-hidden />
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900 dark:text-white">Setting up your {name}…</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">This takes a moment.</p>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-[17px] font-semibold text-gray-900 dark:text-white">Your {name} isn’t ready yet</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{state.text}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {state.signIn && <a href={loginHref} className="inline-flex items-center min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">Sign in</a>}
              {state.retry && <button type="button" onClick={() => void run()} className="min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">Try again</button>}
              <Link href="/" className="inline-flex items-center min-h-[44px] px-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">Back to Udyaibase</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

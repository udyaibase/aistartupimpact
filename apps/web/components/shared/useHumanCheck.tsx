'use client';

import { useCallback, useState } from 'react';
import TurnstileWidget from './TurnstileWidget';

const HAS_SITE_KEY = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * The Turnstile check for a public form. Render `widget` inside the form, send `token` with the request, and call
 * `reset()` after every send: a token works once, so the next send needs a fresh check.
 *
 * `lazy`: the widget appears only after `arm()` (e.g. when the email field gets focus), for small forms shown on many
 * pages, such as the newsletter box, so pages don't load the check until someone starts filling it in.
 * `ready` is false while a check is still owed, for disabling the send button.
 */
export function useHumanCheck({ lazy = false, className = 'mt-3' }: { lazy?: boolean; className?: string } = {}) {
  const [token, setToken] = useState('');
  const [round, setRound] = useState(0);
  const [armed, setArmed] = useState(!lazy);

  const reset = useCallback(() => { setToken(''); setRound((r) => r + 1); }, []);
  const arm = useCallback(() => setArmed(true), []);

  const widget = HAS_SITE_KEY && armed
    ? <TurnstileWidget key={round} className={className} onSuccess={setToken} onExpire={() => setToken('')} onError={() => setToken('')} />
    : null;

  return { token, widget, reset, arm, ready: !HAS_SITE_KEY || !!token };
}

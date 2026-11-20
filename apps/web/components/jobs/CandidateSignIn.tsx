'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import TurnstileWidget from '@/components/shared/TurnstileWidget';
import CodeInput from '@/components/ui/CodeInput';
import { CONTROL_FIELD, CONTROL_LABEL, CONTROL_LINK, CONTROL_OUTLINE, CONTROL_PRIMARY } from '@/lib/ui/form-controls';

const HAS_CAPTCHA = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function GoogleMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

/**
 * Job seeker sign-in: Google, or a 6-digit code to their email. Both prove the email, so applications sent with it
 * show in "My applications". `returnTo` is where they land afterwards (must be a path on this site).
 */
export default function CandidateSignIn({ returnTo, title, subtitle, compact = false, initialEmail = '', startWithEmail = false, onBack, applyToken }: {
  returnTo: string; title?: string; subtitle?: string; compact?: boolean; initialEmail?: string;
  /** Open on the email step (the header sign-in box already shows Google). `onBack` leaves it from there. */
  startWithEmail?: boolean; onBack?: () => void;
  /** Right after applying: the apply session, so one tap emails a code to `initialEmail` with no form and no second human check. */
  applyToken?: string;
}) {
  const [mode, setMode] = useState<'choose' | 'email' | 'code'>(startWithEmail ? 'email' : 'choose');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codeWrong, setCodeWrong] = useState(false);
  const oneTap = !!applyToken && !!initialEmail && email === initialEmail;

  async function call(body: Record<string, unknown>) {
    const res = await fetch('/api/user/auth/email-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { res, data: await res.json().catch(() => ({})) };
  }
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const { res, data } = await call({ action: 'send', email, captcha, ...(oneTap ? { applyToken } : {}) });
      if (res.ok) { setMode('code'); setCode(''); }
      // The quick path didn't work (the session ran out): fall back to the ordinary email step, which has the check.
      else if (oneTap && mode === 'choose') { setMode('email'); }
      else setError(data.error || 'Couldn’t send a code.');
    } catch { setError('You seem to be offline.'); }
    setCaptcha('');
    setBusy(false);
  }
  async function verify(e?: React.FormEvent, typed?: string) {
    e?.preventDefault();
    const c = typed ?? code;
    if (c.length !== 6 || busy) return;
    setBusy(true); setError(''); setCodeWrong(false);
    try {
      // The terms notice below is shown next to both sign-in options, so continuing counts as agreeing (as on sign-up).
      const { res, data } = await call({ action: 'verify', email, code: c, returnTo, agreeToTerms: true });
      if (res.ok) { window.location.href = data.redirect || returnTo; return; }
      setError(data.error || 'That didn’t work. Try again.');
      if (data.field === 'code') { setCodeWrong(true); setCode(''); }
    } catch { setError('You seem to be offline.'); }
    setBusy(false);
  }

  // One look for every sign-in control: 44px high, 8px corners, 1px borders, 16px text on phones (no zoom on focus).
  const primary = CONTROL_PRIMARY;
  const outline = CONTROL_OUTLINE;
  const input = CONTROL_FIELD;
  const textLink = CONTROL_LINK;
  const back = () => { setError(''); if (startWithEmail && onBack) onBack(); else setMode('choose'); };

  return (
    <div className={`font-jakarta ${compact ? '' : 'rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5'}`}>
      {title && mode !== 'code' && <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{title}</p>}
      {subtitle && mode !== 'code' && <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400">{subtitle}</p>}

      {mode === 'choose' && (
        // Side by side on phones too (shorter labels there), so the box doesn't push the form far down.
        <div className={`grid grid-cols-2 gap-2 ${title || subtitle ? 'mt-3' : ''}`}>
          <a href={`/api/user/auth/google?returnTo=${encodeURIComponent(returnTo)}`} className={outline}>
            <GoogleMark /> <span className="sm:hidden">Google</span><span className="hidden sm:inline">Continue with Google</span>
          </a>
          <button type="button" disabled={busy} onClick={() => (oneTap ? send() : setMode('email'))} className={outline}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Mail className="w-5 h-5" aria-hidden />} <span className="sm:hidden">Email code</span><span className="hidden sm:inline">Email me a code</span>
          </button>
        </div>
      )}

      {mode === 'email' && (
        <form onSubmit={send} className={`${title || subtitle ? 'mt-3' : ''} space-y-3`}>
          <div>
            <label htmlFor="cs-email" className={CONTROL_LABEL}>Email</label>
            <input id="cs-email" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
          </div>
          {HAS_CAPTCHA && <TurnstileWidget onSuccess={setCaptcha} onExpire={() => setCaptcha('')} onError={() => setCaptcha('')} />}
          <button type="submit" disabled={busy || (HAS_CAPTCHA && !captcha)} className={primary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Send code
          </button>
          <div className="text-center"><button type="button" onClick={back} className={textLink}>Back</button></div>
        </form>
      )}

      {mode === 'code' && (
        // Its own centered step: what was sent where, the boxes, one full-width button, then the small links.
        <form onSubmit={verify} className="text-center">
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Check your email</p>
          <label htmlFor="cs-code" className="block mt-1 text-sm text-gray-600 dark:text-gray-400">
            Enter the 6-digit code we sent to <span className="block font-medium text-gray-900 dark:text-white truncate">{email}</span>
          </label>
          <div className="mt-4">
            {/* Signs in as soon as the 6th digit is in; the button stays for keyboard and screen-reader users. */}
            <CodeInput id="cs-code" autoFocus align="center" value={code} invalid={codeWrong} disabled={busy}
              onChange={(v) => { setCode(v); if (codeWrong) setCodeWrong(false); }} onComplete={(v) => verify(undefined, v)} />
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={busy || code.length !== 6} className={`${primary} mt-4`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" onClick={() => { setMode('email'); setError(''); setCode(''); }} className={`${textLink} mt-1`}>Use a different email</button>
        </form>
      )}

      {error && mode !== 'code' && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <p className={`mt-3 text-xs text-gray-500 dark:text-gray-400 ${mode === 'code' ? 'text-center' : ''}`}>
        By continuing, you agree to our <a href="/terms-and-conditions" target="_blank" rel="noopener" className="underline hover:text-gray-900 dark:hover:text-white">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener" className="underline hover:text-gray-900 dark:hover:text-white">Privacy Policy</a>.
      </p>
    </div>
  );
}

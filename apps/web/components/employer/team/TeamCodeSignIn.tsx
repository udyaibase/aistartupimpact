'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import CodeInput from '@/components/ui/CodeInput';
import { CONTROL_FIELD, CONTROL_LABEL, CONTROL_PRIMARY_BRAND } from '@/lib/ui/form-controls';
import TurnstileWidget from '@/components/shared/TurnstileWidget';

type Choice = { employerId: string; companyName: string; logoUrl: string | null; role: string; invited: boolean };

/**
 * Email-code sign-in for everyone on a hiring team (owners and teammates): email → 6-digit code
 * (→ choose a team when on several). Pending invites are accepted by signing in. Account owners with
 * two-step sign-in continue to the page's two-step step through onRequires2FA.
 */
export default function TeamCodeSignIn({ onRequires2FA }: { onRequires2FA?: (challengeToken: string) => void }) {
  const [step, setStep] = useState<'email' | 'code' | 'choose'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // The human check runs once, before a code is emailed. A token works once, so it is cleared after use and the
  // check shows again if they come back to this step.
  const turnstileToken = useRef('');
  const [checkKey, setCheckKey] = useState(0);
  // A new code can be asked for once the server's 60-second gap has passed.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function post(body: Record<string, string>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/employer/auth/member-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setError(d.error || 'Something went wrong.'); return null; }
      return d;
    } catch {
      setBusy(false);
      setError('You seem to be offline.');
      return null;
    }
  }

  async function verify(employerId?: string) {
    const d = await post({ step: 'verify', email, code, ...(employerId ? { employerId } : {}) });
    if (!d) return;
    if (d.choose) { setChoices(d.choose); setStep('choose'); return; }
    if (d.requires2FA && d.challengeToken) { onRequires2FA?.(d.challengeToken); return; }
    if (d.redirect) window.location.href = d.redirect;
  }

  // The sixth digit signs in by itself; the ref always points at the latest verify (it reads the current code).
  const verifyRef = useRef(() => {});
  verifyRef.current = () => { if (!busy) verify(); };

  const input = CONTROL_FIELD;
  const primary = CONTROL_PRIMARY_BRAND;

  return (
    <div className="font-jakarta space-y-3">
      {step === 'email' && (
        <form onSubmit={async (e) => { e.preventDefault(); const d = await post({ step: 'send', email, turnstileToken: turnstileToken.current }); turnstileToken.current = ''; if (d) { setInfo(d.message); setCode(''); setResendIn(60); setStep('code'); } else setCheckKey((k) => k + 1); }} className="space-y-3" noValidate>
          <div>
            <label htmlFor="tm-email" className={CONTROL_LABEL}>Work email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <input id="tm-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={`${input} pl-10`} />
            </div>
          </div>
          <TurnstileWidget key={checkKey} onSuccess={(token) => { turnstileToken.current = token; }} onExpire={() => { turnstileToken.current = ''; }} />
          <button type="submit" disabled={busy || !email.trim()} className={primary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Email me a sign-in code
          </button>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-3 text-center" noValidate>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">{info}</p>
          <label htmlFor="tm-code" className="block text-sm font-medium text-gray-800 dark:text-gray-200">Enter the 6-digit code sent to <span className="block font-normal truncate">{email}</span></label>
          <CodeInput id="tm-code" autoFocus value={code} onChange={setCode} disabled={busy} onComplete={() => verifyRef.current()} />
          <button type="submit" disabled={busy || code.length !== 6} className={primary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Sign in
          </button>
          {/* Asking again goes back one step with the email kept, because each code request needs the human check. */}
          <button type="button" disabled={resendIn > 0} onClick={() => { setStep('email'); setCode(''); setError(''); setCheckKey((k) => k + 1); }}
            className="w-full min-h-[40px] text-sm font-semibold text-gray-800 dark:text-gray-200 hover:underline disabled:font-normal disabled:text-gray-500 disabled:no-underline">
            {resendIn > 0 ? `Didn’t get it? You can ask for a new code in ${resendIn}s` : 'Didn’t get it? Send a new code'}
          </button>
          <button type="button" onClick={() => { setStep('email'); setEmail(''); setCode(''); setError(''); setCheckKey((k) => k + 1); }} className="w-full min-h-[40px] text-sm text-gray-600 dark:text-gray-400 hover:underline">Use a different email</button>
        </form>
      )}
      {step === 'choose' && (
        <div className="space-y-2">
          <p className="text-[13px] text-gray-600 dark:text-gray-400">You&apos;re on more than one hiring team. Which one?</p>
          {choices.map((c) => (
            <button key={c.employerId} type="button" onClick={() => verify(c.employerId)} disabled={busy}
              className="w-full min-h-[52px] px-3 flex items-center gap-3 rounded-md border border-gray-300 dark:border-gray-700 text-left hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              {c.logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                : <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0" aria-hidden>{c.companyName.charAt(0)}</span>}
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{c.companyName}</span>
                <span className="block text-xs text-gray-500">{c.role}{c.invited ? ' · invitation, accepted when you continue' : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

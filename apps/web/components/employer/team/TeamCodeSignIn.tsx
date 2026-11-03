'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';

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
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

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

  const input = 'w-full min-h-[44px] px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30';
  const primary = 'w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50';

  return (
    <div className="font-jakarta space-y-3">
      {step === 'email' && (
        <form onSubmit={async (e) => { e.preventDefault(); const d = await post({ step: 'send', email }); if (d) { setInfo(d.message); setStep('code'); } }} className="space-y-3" noValidate>
          <div>
            <label htmlFor="tm-email" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Work email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <input id="tm-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={`${input} pl-10`} />
            </div>
          </div>
          <button type="submit" disabled={busy || !email.trim()} className={primary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Email me a sign-in code
          </button>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-3" noValidate>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">{info}</p>
          <label htmlFor="tm-code" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">6-digit code sent to {email}</label>
          <input id="tm-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${input} text-center tracking-[0.3em] font-semibold`} />
          <button type="submit" disabled={busy || code.length !== 6} className={primary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Sign in
          </button>
          <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="w-full min-h-[40px] text-sm text-gray-600 dark:text-gray-400 hover:underline">Use a different email</button>
        </form>
      )}
      {step === 'choose' && (
        <div className="space-y-2">
          <p className="text-[13px] text-gray-600 dark:text-gray-400">You&apos;re on more than one hiring team. Which one?</p>
          {choices.map((c) => (
            <button key={c.employerId} type="button" onClick={() => verify(c.employerId)} disabled={busy}
              className="w-full min-h-[52px] px-3 flex items-center gap-3 rounded-xl border border-gray-300 dark:border-gray-700 text-left hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
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

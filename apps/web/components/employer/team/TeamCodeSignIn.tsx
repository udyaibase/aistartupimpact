'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** Passwordless sign-in for invited teammates: email → 6-digit code (→ choose workspace). */
export default function TeamCodeSignIn() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'email' | 'code' | 'choose'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [choices, setChoices] = useState<{ employerId: string; companyName: string }[]>([]);
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
    if (d.redirect) window.location.href = d.redirect;
  }

  const input = 'w-full min-h-[44px] px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full mt-2 min-h-[44px] text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:underline">
        Invited to a team? Sign in with an email code
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 font-jakarta space-y-3">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">Team member sign-in</p>
      {step === 'email' && (
        <form onSubmit={async (e) => { e.preventDefault(); const d = await post({ step: 'send', email }); if (d) { setInfo(d.message); setStep('code'); } }} className="space-y-2" noValidate>
          <label htmlFor="tm-email" className="sr-only">Email</label>
          <input id="tm-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={input} />
          <button type="submit" disabled={busy || !email.trim()} className="w-full min-h-[44px] rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Email me a code
          </button>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-2" noValidate>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">{info}</p>
          <label htmlFor="tm-code" className="sr-only">6-digit code</label>
          <input id="tm-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${input} text-center tracking-[0.3em] font-semibold`} />
          <button type="submit" disabled={busy || code.length !== 6} className="w-full min-h-[44px] rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Sign in
          </button>
          <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="w-full min-h-[40px] text-sm text-gray-600 hover:underline">Use a different email</button>
        </form>
      )}
      {step === 'choose' && (
        <div className="space-y-2">
          <p className="text-[13px] text-gray-600 dark:text-gray-400">You&apos;re on more than one team. Which one?</p>
          {choices.map((c) => (
            <button key={c.employerId} type="button" onClick={() => verify(c.employerId)} disabled={busy}
              className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-left text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              {c.companyName}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

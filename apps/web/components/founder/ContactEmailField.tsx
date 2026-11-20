'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import { formatCountdown, maskEmail } from '@/lib/ui/code-entry';
import CodeInput from '@/components/ui/CodeInput';
import { CONTROL_PRIMARY_BRAND } from '@/lib/ui/form-controls';

const inputCls = 'w-full h-11 px-3.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent';

const norm = (e: string) => e.trim().toLowerCase();

/**
 * The startup's private contact email. A new or changed address must be confirmed with a 6-digit code before it can be
 * saved; the founder's own verified sign-in email is confirmed straight away. The proof goes to the server with the form.
 */
export default function ContactEmailField({ value, onChange, confirmedEmail, onConfirmed, autoCheck = false }: {
  value: string;
  onChange: (email: string) => void;
  /** The address already confirmed (saved, or proven in this session). */
  confirmedEmail: string;
  onConfirmed: (email: string, proof: string | null) => void;
  /** Ask the server, without sending anything, whether the starting value is already the founder's own verified email. */
  autoCheck?: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const confirmed = !!value && norm(value) === norm(confirmedEmail);

  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  async function call(body: Record<string, string>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/founder/contact-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (data.retryAfter) setCooldown(data.retryAfter);
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return null; }
      return data;
    } catch {
      setError('You seem to be offline.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  // The founder's own verified email: confirmed without a code.
  useEffect(() => {
    if (!autoCheck || !value || confirmed) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/founder/contact-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'check', email: value }) });
        const data = await res.json().catch(() => ({}));
        if (live && data.confirmed) onConfirmed(norm(value), data.proof ?? null);
      } catch { /* the founder can still confirm with a code */ }
    })();
    return () => { live = false; };
    // Only for the starting value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    const d = await call({ step: 'send', email: value });
    if (!d) return;
    if (d.confirmed) { onConfirmed(norm(value), d.proof ?? null); setPhase('idle'); return; }
    setPhase('code');
    setCooldown(d.cooldown ?? 60);
  };

  const checking = useRef(false);
  const verify = async (entered = code) => {
    if (entered.length !== 6 || checking.current) return;
    checking.current = true;
    const d = await call({ step: 'verify', email: value, code: entered }).finally(() => { checking.current = false; });
    if (d?.confirmed) { onConfirmed(norm(value), d.proof ?? null); setPhase('idle'); setCode(''); }
    else setCode('');
  };

  return (
    <div>
      <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Contact email <span className="text-red-500">*</span>
      </label>
      <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
        <Lock className="w-3 h-3" aria-hidden /> Private. Only our team uses it, for messages about this listing. Never shown publicly.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            id="contactEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={value}
            onChange={(e) => { onChange(e.target.value); setPhase('idle'); setError(''); }}
            className={`${inputCls} ${confirmed ? 'pr-28' : ''}`}
            placeholder="founders@yourcompany.com"
            aria-describedby="contactEmail-status"
          />
          {confirmed && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" aria-hidden /> Confirmed
            </span>
          )}
        </div>
        {!confirmed && phase === 'idle' && (
          <button type="button" onClick={send} disabled={busy || !value.trim() || cooldown > 0} className="btn-brand !rounded-md h-11 gap-2 shrink-0 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {cooldown > 0 ? `Wait ${formatCountdown(cooldown)}` : 'Send code'}
          </button>
        )}
      </div>

      {!confirmed && phase === 'code' && (
        <div className="mt-3 p-4 rounded-md bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-center">
          <label htmlFor="contactEmailCode" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Enter the 6-digit code sent to <span className="block font-normal">{maskEmail(value)}</span></label>
          <div className="max-w-sm mx-auto space-y-2">
            <CodeInput id="contactEmailCode" autoFocus value={code} onChange={setCode} disabled={busy}
              onComplete={(v) => { if (!busy) verify(v); }} />
            <button type="button" onClick={() => verify()} disabled={busy || code.length !== 6} className={CONTROL_PRIMARY_BRAND}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Confirm
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Not there? Check your spam or promotions folder. Codes expire in 10 minutes.</p>
          <div className="mt-1 flex justify-center gap-4">
            <button type="button" onClick={send} disabled={busy || cooldown > 0} className="min-h-[36px] text-xs font-medium text-brand disabled:text-gray-400">
              {cooldown > 0 ? `Resend in ${formatCountdown(cooldown)}` : 'Resend code'}
            </button>
            <button type="button" onClick={() => { setPhase('idle'); setCode(''); setError(''); document.getElementById('contactEmail')?.focus(); }} className="min-h-[36px] text-xs font-medium text-gray-600 dark:text-gray-400 hover:underline">
              Change email
            </button>
          </div>
        </div>
      )}

      <p id="contactEmail-status" role="status" className="sr-only">{confirmed ? 'Contact email confirmed' : ''}</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

/** Lets an unverified employer finish email verification from anywhere in the portal. */
export default function VerifyEmailBanner({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info' | 'success'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function sendCode() {
    setBusy('send');
    setMessage(null);
    try {
      const res = await fetch('/api/employer/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOpen(true);
        setCooldown(data.cooldown ?? 60);
        setMessage({ tone: 'info', text: `We sent a 6-digit code to ${email}. It expires in 10 minutes.` });
      } else {
        if (data.retryAfter) { setOpen(true); setCooldown(data.retryAfter); }
        setMessage({ tone: 'error', text: data.error || "We couldn't send a code. Please try again." });
      }
    } catch {
      setMessage({ tone: 'error', text: 'You seem to be offline. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setMessage({ tone: 'error', text: 'Enter the 6-digit code from the email.' });
      return;
    }
    setBusy('verify');
    setMessage(null);
    try {
      const res = await fetch('/api/employer/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ tone: 'success', text: 'Email verified. You can now post jobs.' });
        setTimeout(() => router.refresh(), 1200);
      } else {
        setCode('');
        setMessage({ tone: 'error', text: data.error || 'That code didn’t work. Try again.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'You seem to be offline. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  }

  const tone = {
    error: 'text-red-700 dark:text-red-300',
    info: 'text-amber-800 dark:text-amber-200',
    success: 'text-green-700 dark:text-green-300',
  };

  return (
    <div id="verify-email" role="region" aria-label="Email verification" className="scroll-mt-4 mb-4 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 font-jakarta">
      <div className="flex items-center gap-3 flex-wrap">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
        <p className="text-sm text-amber-800 dark:text-amber-200 flex-1 min-w-[200px] break-words">
          <span className="font-semibold">Verify your email</span> to publish jobs and show candidates your company is real.
        </p>
        {!open && (
          <button onClick={sendCode} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors shrink-0 disabled:opacity-60">
            {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
            Verify Now {busy !== 'send' && <ArrowRight className="w-3.5 h-3.5" aria-hidden />}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={verify} className="mt-3 sm:pl-8 flex flex-col sm:flex-row gap-2" noValidate>
          <label htmlFor="verify-code" className="sr-only">Verification code</label>
          <input
            ref={inputRef}
            id="verify-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            className="w-full sm:w-40 min-h-[44px] px-3 rounded-md border border-amber-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base tracking-[0.3em] font-semibold text-center text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          <button type="submit" disabled={busy !== null || code.length !== 6}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy === 'verify' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            Verify
          </button>
          <button type="button" onClick={sendCode} disabled={busy !== null || cooldown > 0}
            className="min-h-[44px] px-3 rounded-md text-sm font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-60">
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
          </button>
        </form>
      )}

      {message && (
        <p role="status" aria-live="polite" className={`mt-2 sm:pl-8 text-sm flex items-center gap-1.5 ${tone[message.tone]}`}>
          {message.tone === 'success' && <CheckCircle2 className="w-4 h-4" aria-hidden />}
          {message.text}
        </p>
      )}
    </div>
  );
}

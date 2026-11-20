'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import CodeInput from '@/components/ui/CodeInput';

/** Accounts that never proved their email: one code, then applications sent with it are linked. */
export default function VerifyEmailToLink({ email }: { email: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState(false);

  async function call(body: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/user/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Something went wrong.'); if (body.action === 'verify') { setWrong(true); setCode(''); } setBusy(false); return; }
      if (body.action === 'send') { setSent(true); setBusy(false); return; }
      router.refresh();
    } catch { setError('You seem to be offline.'); }
    setBusy(false);
  }

  return (
    <div className="rounded-[14px] border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-4">
      <p className="flex items-start gap-2 text-sm text-gray-900 dark:text-white">
        <ShieldCheck className="w-5 h-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <span><span className="font-semibold">Confirm your email to see applications you sent before signing in.</span> We’ll send a code to {email}.</span>
      </p>
      {!sent ? (
        <button type="button" onClick={() => call({ action: 'send' })} disabled={busy} className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Send code
        </button>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void call({ action: 'verify', code }); }} className="mt-3 space-y-2 max-w-sm text-center">
          <label htmlFor="ve-code" className="block text-sm font-semibold text-gray-900 dark:text-white">Enter the 6-digit code</label>
          <CodeInput id="ve-code" autoFocus value={code} invalid={wrong} disabled={busy}
            onChange={(v) => { setCode(v); if (wrong) setWrong(false); }} onComplete={(v) => { if (!busy) void call({ action: 'verify', code: v }); }} />
          <button type="submit" disabled={busy || code.length !== 6} className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Confirm
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

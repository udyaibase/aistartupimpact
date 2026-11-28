'use client';

import { useId, useState } from 'react';
import { Loader2, Tag } from 'lucide-react';

/**
 * "Have a promo code?" on the Plans & billing page of the hiring portal and the event host portal.
 * A free-plan code is applied at once and nothing is paid. A discount code is checked and handed to the page
 * (`onDiscount`), which sends it with the next payment. `endpoint` is that portal's redeem route.
 */
export interface AppliedDiscount { code: string; label: string; plan: string; cycle: string }

export default function PromoCodeBox({ endpoint, onApplied, discount, onDiscount }: {
  endpoint: string; onApplied: () => void;
  /** The discount code waiting for checkout, if one has been entered. */
  discount: AppliedDiscount | null; onDiscount: (d: AppliedDiscount | null) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError('Enter your code.'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { setError(j.error || 'Couldn’t apply the code. Try again.'); return; }
      if (j.kind === 'discount') { onDiscount({ code: j.code, label: j.label, plan: j.plan, cycle: j.cycle }); setCode(''); setOpen(false); return; }
      const until = new Date(j.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
      setDone(`Code applied. You have ${j.plan} free until ${until}. Nothing is charged.`);
      setCode('');
      onApplied();
    } catch {
      setError('Couldn’t reach us. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (discount) {
    return (
      <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-[10px] px-3 py-2 bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-300">
        <span><span className="font-mono font-semibold tracking-wider">{discount.code}</span> is ready: {discount.label}. The price is reduced when you pay.</span>
        <button type="button" onClick={() => onDiscount(null)} className="font-semibold underline">Remove</button>
      </p>
    );
  }
  if (done) return <p role="status" className="text-sm rounded-[10px] px-3 py-2 bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-300">{done}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#A50F15] dark:text-red-300 hover:underline">
        <Tag className="w-4 h-4" aria-hidden /> Have a promo code?
      </button>
    );
  }
  return (
    <form onSubmit={apply} noValidate className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-900 dark:text-white">Promo code</label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input id={id} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (error) setError(''); }} maxLength={24} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint`} placeholder="LAUNCH100"
          className={`min-h-[44px] flex-1 min-w-[180px] rounded-[10px] border bg-white dark:bg-gray-950 px-3 text-sm font-mono tracking-wider text-gray-900 dark:text-white ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'}`} />
        <button type="submit" disabled={busy} className="min-h-[44px] inline-flex items-center gap-2 rounded-[10px] bg-[#A50F15] px-4 text-sm font-semibold text-white hover:bg-[#8E0D12] disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}{busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      <p id={`${id}-hint`} role={error ? 'alert' : undefined} className={`mt-1.5 text-xs ${error ? 'font-medium text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
        {error || 'A code gives you a free period or money off a plan.'}
      </p>
    </form>
  );
}

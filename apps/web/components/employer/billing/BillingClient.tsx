'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { FOUNDING_DISCOUNT, FOUNDING_LIMIT, FOUNDING_LOCK_MONTHS, rupees, type BillingCycle, type PlanDef, type PlanKey } from '@/lib/employer/plans';
import { payWithRazorpay } from '@/lib/billing/checkout-client';
import BillingDetailsForm from '@/components/billing/BillingDetailsForm';
import type { BillingProfile } from '@/lib/billing/details';
import InvoicesTable, { type InvoiceRow } from '@/components/billing/InvoicesTable';

type Price = { amount: number; gst: number; total: number };
type PlanCard = PlanDef & { monthly: Price; annual: Price; annualFounding: Price };


const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function BillingClient({ current, expiresAt, ai, aiAutoScreen, openJobs, seatsUsed, cycle: currentCycle, founding, plans, payments, paymentsReady, billing, invoices }: {
  current: PlanKey;
  expiresAt: string | null;
  ai: { used: number; limit: number; left: number };
  aiAutoScreen: boolean;
  openJobs: number;
  seatsUsed: number;
  cycle: BillingCycle;
  founding: { eligible: boolean; member: boolean; placesLeft: number };
  plans: PlanCard[];
  payments: InvoiceRow[];
  paymentsReady: boolean;
  billing: BillingProfile;
  invoices: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auto, setAuto] = useState(aiAutoScreen);
  const [cycle, setCycle] = useState<BillingCycle>(current !== 'FREE' ? currentCycle : 'MONTHLY');
  const plan = plans.find((p) => p.key === current)!;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 864e5)) : null;

  async function buy(key: PlanKey) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/employer/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: key, cycle }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Couldn’t start the payment.'); setBusy(null); return; }
      const out = await payWithRazorpay(d, '/api/employer/billing/verify');
      if (out.ok) { setNotice('Payment received. Your plan is active.'); router.refresh(); }
      else if (!out.cancelled) setError(out.error);
      setBusy(null);
    } catch {
      setError('You seem to be offline.');
      setBusy(null);
    }
  }

  async function toggleAuto(next: boolean) {
    setAuto(next);
    const res = await fetch('/api/employer/billing/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiAutoScreen: next }) }).catch(() => null);
    if (!res?.ok) { setAuto(!next); setError('Couldn’t save that setting.'); }
  }

  return (
    <div className="font-jakarta space-y-5">
      <div>
        <h1 className="portal-title">Plans &amp; billing</h1>
        <p className="portal-subtitle">Pay monthly or yearly. Plans never renew automatically: we remind you before yours ends.</p>
      </div>

      {(error || notice) && (
        <p role={error ? 'alert' : 'status'} className={`text-sm rounded-[10px] px-3 py-2 ${error ? 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300' : 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'}`}>
          {error || notice}
        </p>
      )}

      <section aria-labelledby="cur" className={`${card} p-4 sm:p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <h2 id="cur" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current plan</h2>
          <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{plan.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {expiresAt ? `${currentCycle === 'ANNUAL' ? 'Yearly · ' : ''}Active until ${fmt(expiresAt)} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Free forever'}
          </p>
          {founding.member && <p className="mt-1 text-xs font-semibold text-[#A50F15] dark:text-red-300">Founding member price</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Open jobs</p>
          <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white tabular-nums">{openJobs} <span className="text-sm font-normal text-gray-500">of {plan.maxActiveJobs}</span></p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team seats</p>
          <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white tabular-nums">{seatsUsed} <span className="text-sm font-normal text-gray-500">{plan.maxSeats === null ? 'unlimited' : `of ${plan.maxSeats}`}</span></p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI reviews this month</p>
          {ai.limit ? (
            <>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white tabular-nums">{ai.used} <span className="text-sm font-normal text-gray-500">of {ai.limit}</span></p>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={ai.limit} aria-valuenow={ai.used} aria-label="AI reviews used">
                <div className="h-full bg-violet-600" style={{ width: `${Math.min(100, (ai.used / ai.limit) * 100)}%` }} />
              </div>
            </>
          ) : <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Paused until you renew</p>}
        </div>
        {ai.limit > 0 && (
          <label className="sm:col-span-2 lg:col-span-4 flex items-start gap-3 pt-3 border-t border-gray-100 dark:border-gray-800 cursor-pointer">
            <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#A50F15]" />
            <span>
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">Review new applicants with AI automatically</span>
              <span className="block text-[13px] text-gray-600 dark:text-gray-400">Each review uses one of your monthly AI reviews. Turn off to review only the candidates you choose.</span>
            </span>
          </label>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-[10px] border border-gray-200 dark:border-gray-800 p-1 bg-white dark:bg-gray-900">
          {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)}
              className={`min-h-[36px] px-3 rounded-[8px] text-sm font-semibold ${cycle === c ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
              {c === 'MONTHLY' ? 'Monthly' : 'Yearly · 2 months free'}
            </button>
          ))}
        </div>
        {cycle === 'ANNUAL' && founding.eligible && (
          <p className="text-[13px] text-gray-700 dark:text-gray-300">
            <span className="font-semibold text-[#A50F15] dark:text-red-300">Founding price: {Math.round(FOUNDING_DISCOUNT * 100)}% off yearly plans</span>
            {' '}for {FOUNDING_LOCK_MONTHS} months{founding.member ? '' : ` · ${founding.placesLeft} of ${FOUNDING_LIMIT} places left`}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = p.key === current;
          const paid = p.key !== 'FREE';
          const annual = cycle === 'ANNUAL';
          const price = annual ? (founding.eligible ? p.annualFounding : p.annual) : p.monthly;
          const sameAsCurrent = isCurrent && (current === 'FREE' || cycle === currentCycle);
          return (
            <section key={p.key} aria-labelledby={`plan-${p.key}`} className={`${card} p-5 flex flex-col ${p.key === 'PRO' ? 'ring-2 ring-[#A50F15]/70 border-transparent' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 id={`plan-${p.key}`} className="text-base font-bold text-gray-900 dark:text-white">{p.name}</h2>
                {isCurrent && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">Current</span>}
                {!isCurrent && p.key === 'PRO' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#A50F15]/10 text-[#A50F15] dark:text-red-300">Most popular</span>}
              </div>
              <p className="mt-2">
                {annual && paid && founding.eligible && <span className="mr-1.5 text-sm text-gray-400 line-through tabular-nums">{rupees(p.annual.amount)}</span>}
                <span className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums">{paid ? rupees(price.amount) : '₹0'}</span>
                <span className="text-sm text-gray-500">{paid ? (annual ? ' / year' : ' / month') : ''}</span>
              </p>
              {paid
                ? <p className="text-xs text-gray-500">+ 18% GST · {rupees(price.total)} total{annual ? ` · ${rupees(Math.round(price.amount / 12))}/mo` : ''}</p>
                : <p className="text-xs text-gray-500">Free forever</p>}
              <ul className="mt-4 space-y-2 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13.5px] text-gray-700 dark:text-gray-300">
                    {f.startsWith('AI') ? <Sparkles className="w-4 h-4 mt-0.5 text-violet-600 shrink-0" aria-hidden /> : <Check className="w-4 h-4 mt-0.5 text-green-600 shrink-0" aria-hidden />} {f}
                  </li>
                ))}
                <li className="flex items-start gap-2 text-[13px] text-gray-500"><Check className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden /> Support: {p.support}</li>
              </ul>
              {paid && (
                <button type="button" onClick={() => buy(p.key)} disabled={!!busy || !paymentsReady}
                  className={`mt-5 w-full min-h-[44px] rounded-[10px] text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${sameAsCurrent ? 'border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800'}`}>
                  {busy === p.key && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {sameAsCurrent ? (annual ? 'Add 1 year' : 'Add 30 days') : current === 'FREE' ? `Upgrade to ${p.name}` : `Switch to ${p.name}${isCurrent ? (annual ? ' yearly' : ' monthly') : ''}`}
                </button>
              )}
              {paid && !sameAsCurrent && current !== 'FREE' && <p className="mt-2 text-xs text-gray-500">Switching starts a new {annual ? '1-year' : '30-day'} period today.</p>}
            </section>
          );
        })}
      </div>
      {!paymentsReady && <p className="text-sm text-gray-600 dark:text-gray-400">Online payments are being set up. To upgrade now, email <a className="font-semibold underline" href="mailto:billing@udyaibase.com">billing@udyaibase.com</a>.</p>}

      {payments.length > 0 && (
        <section aria-labelledby="hist" className={card}>
          <h2 id="hist" className="portal-section-title px-4 sm:px-5 pt-4 pb-2">Invoices</h2>
          <InvoicesTable rows={payments} invoicesOn={invoices} apiBase='/api/employer/billing/invoice' invoiceEmail={billing.billingEmail} />
        </section>
      )}
      <section aria-labelledby="bd-h" className={`${card} p-4 sm:p-5`}>
        <h2 id="bd-h" className="portal-section-title">Billing details</h2>
        <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">Who your invoices are made out to and where they’re emailed.</p>
        <BillingDetailsForm initial={billing} lookupUrl="/api/employer/billing/gstin" save={async (details) => {
          const res = await fetch('/api/employer/billing/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billing: details }) }).catch(() => null);
          if (!res) return { error: 'You seem to be offline.' };
          const d = await res.json().catch(() => ({}));
          return res.ok ? { warnings: d.warnings } : { error: d.error || 'Couldn’t save.', field: d.field };
        }} />
      </section>
    </div>
  );
}

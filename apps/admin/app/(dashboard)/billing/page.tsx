'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Receipt, RotateCcw } from 'lucide-react';
import { billingOverviewAction, refundPaymentAction, type BillingPayment } from './actions';

type Overview = Extract<Awaited<ReturnType<typeof billingOverviewAction>>, { success: true }>;
type Rev = Overview['revenue']['thisMonth'];

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl';
const input = 'min-h-[38px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20';

function RevenueCard({ label, r }: { label: string; r: Rev }) {
  const total = r.employer + r.host + r.ticketFees;
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{rupees(total)}</p>
      <dl className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex justify-between"><dt>Employer plans</dt><dd className="tabular-nums">{rupees(r.employer)}</dd></div>
        <div className="flex justify-between"><dt>Host Pro &amp; Boosts</dt><dd className="tabular-nums">{rupees(r.host)}</dd></div>
        <div className="flex justify-between"><dt>Ticket fees</dt><dd className="tabular-nums">{rupees(r.ticketFees)}</dd></div>
      </dl>
    </div>
  );
}

function RefundDialog({ p, onClose, onDone }: { p: BillingPayment; onClose: () => void; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState(String(p.totalPaise / 100));
  const [reason, setReason] = useState('');
  const [endAccess, setEndAccess] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boost = p.product.includes('Boost');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await refundPaymentAction({ source: p.source, id: p.id, amountRupees: Number(amount), reason, endAccess });
    setBusy(false);
    if (!r.success) { setError(r.error); return; }
    onDone(r.online ? `Refund ${r.refundId} started in Razorpay. The customer has been emailed.` : 'Refund recorded. Transfer the money by bank; the customer has been emailed.');
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="refund-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <form onSubmit={submit} className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-xl p-5 shadow-xl space-y-3">
        <div>
          <p id="refund-title" className="text-base font-semibold text-gray-900 dark:text-white">Refund {p.account}</p>
          <p className="text-xs text-gray-500 mt-0.5">{p.product} · paid {rupees(p.totalPaise)} on {fmt(p.paidAt)}{p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}</p>
        </div>
        <p className={`text-xs rounded-lg px-3 py-2 ${p.online ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'}`}>
          {p.online ? 'This is refunded through Razorpay straight away. It can’t be undone.' : 'Paid by invoice or UPI: this only records the refund. Send the money back by bank transfer.'}
        </p>
        <div>
          <label htmlFor="rf-amount" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">Amount (₹, incl. GST)</label>
          <input id="rf-amount" type="number" min={1} step="0.01" max={p.totalPaise / 100} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-full`} />
        </div>
        <div>
          <label htmlFor="rf-reason" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">Reason</label>
          <input id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Charged twice, cancelled within 7 days" className={`${input} w-full`} />
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
          <input type="checkbox" checked={endAccess} onChange={(e) => setEndAccess(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand" />
          {boost ? 'End the Boost on that event now' : 'End their paid plan now (drops to Free)'}
        </label>
        <p className="text-xs text-gray-500">GST: ask accounts to issue a credit note against the original invoice.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="min-h-[38px] px-4 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-[38px] px-4 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Refund
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BillingAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refund, setRefund] = useState<BillingPayment | null>(null);

  const load = async () => {
    const r = await billingOverviewAction();
    if (r.success) setData(r); else setError(r.error ?? 'Failed to load');
  };
  useEffect(() => { load(); }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />;

  return (
    <div className="space-y-5 font-jakarta">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Receipt className="w-5 h-5 text-brand" /> Billing</h1>
        <p className="text-xs text-gray-500 mt-0.5">Revenue excludes GST and is net of refunds. Employer plans and host Pro/Boosts; ticket fees are Udyaibase’s share of paid tickets.</p>
      </div>

      {message && <p role="status" className="text-sm text-green-700 dark:text-green-400">{message}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <RevenueCard label="This month" r={data.revenue.thisMonth} />
        <RevenueCard label="Last month" r={data.revenue.lastMonth} />
        <RevenueCard label="This financial year" r={data.revenue.fy} />
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Growth employers', data.active.growth],
          ['Pro employers', data.active.pro],
          ['Scale employers', data.active.scale],
          ['Pro hosts', data.active.hostPro],
          ['Failed payments (30 days)', data.failed30d],
        ].map(([label, n]) => (
          <div key={label as string} className={`${card} p-4`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${label === 'Failed payments (30 days)' && Number(n) > 0 ? 'text-amber-700' : 'text-gray-900 dark:text-white'}`}>{n}</p>
          </div>
        ))}
      </div>

      <section className={card} aria-labelledby="exp-title">
        <h2 id="exp-title" className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-900 dark:text-white">Plans ending in the next 7 days · {data.expiring.length}</h2>
        {data.expiring.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-500">None.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.expiring.map((x) => (
              <li key={`${x.kind}-${x.id}`} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-gray-900 dark:text-white">{x.name}</span>
                <span className="text-gray-500">{x.email}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">{x.kind === 'HOST' ? 'Host Pro' : x.plan}</span>
                <span className="ml-auto text-amber-700 dark:text-amber-400 text-xs font-semibold">Ends {fmt(x.endsAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} overflow-x-auto`} aria-labelledby="pay-title">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-3">
          <h2 id="pay-title" className="text-sm font-semibold text-gray-900 dark:text-white">Recent payments</h2>
          <Link href="/plans" className="text-xs font-semibold text-brand hover:underline">Grant a plan manually →</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-semibold">Date</th><th className="px-4 py-2 font-semibold">Account</th><th className="px-4 py-2 font-semibold">Product</th><th className="px-4 py-2 font-semibold text-right">Total</th><th className="px-4 py-2 font-semibold">Status</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.payments.map((p) => (
              <tr key={`${p.source}-${p.id}`}>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-400">{fmt(p.paidAt ?? p.createdAt)}</td>
                <td className="px-4 py-2.5"><span className="font-semibold text-gray-900 dark:text-white">{p.account}</span><span className="block text-xs text-gray-500">{p.email}</span></td>
                <td className="px-4 py-2.5 whitespace-nowrap">{p.product}{!p.online && <span className="block text-xs text-gray-500">Manual</span>}</td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{rupees(p.totalPaise)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {p.refundedAt
                    ? <span className="text-xs font-semibold text-gray-700 dark:text-gray-300" title={p.refundReason ?? ''}>Refunded {rupees(p.refundAmountPaise ?? 0)}{p.creditNoteNumber && <span className="block font-mono font-normal text-gray-500">{p.creditNoteNumber}</span>}</span>
                    : p.status === 'FAILED'
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> Failed</span>
                      : <span className="text-xs font-semibold text-green-700 dark:text-green-400">Paid</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {p.status === 'SUCCESS' && !p.refundedAt && (
                    <button type="button" onClick={() => setRefund(p)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"><RotateCcw className="w-3.5 h-3.5" /> Refund</button>
                  )}
                </td>
              </tr>
            ))}
            {data.payments.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No payments yet.</td></tr>}
          </tbody>
        </table>
      </section>

      {refund && <RefundDialog p={refund} onClose={() => setRefund(null)} onDone={(msg) => { setRefund(null); setMessage(msg); load(); }} />}
    </div>
  );
}

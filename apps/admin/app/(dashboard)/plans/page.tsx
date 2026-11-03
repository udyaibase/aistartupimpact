'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Search } from 'lucide-react';
import { endPlanAction, grantPlanAction, listPlanAccountsAction, type PlanAccount } from './actions';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const active = (a: PlanAccount) => a.plan !== 'FREE' && !!a.planExpiresAt && new Date(a.planExpiresAt) > new Date();
const input = 'min-h-[38px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20';

export default function PlansAdminPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PlanAccount[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PlanAccount | null>(null);

  const load = async (term = q) => {
    setRows(null);
    const res = await listPlanAccountsAction(term);
    if (res.success) setRows(res.data); else { setError(res.error ?? 'Failed'); setRows([]); }
  };
  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5 font-jakarta">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><CreditCard className="w-5 h-5 text-brand" /> Plans</h1>
        <p className="text-xs text-gray-500 mt-0.5">Grant or extend a plan for employers and event hosts who paid by invoice or UPI. Online (Razorpay) payments activate on their own.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, host or email (empty = paid accounts)" className={`${input} w-full pl-9`} />
        </div>
        <button className="px-4 rounded-lg bg-brand text-white text-sm font-semibold">Search</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800">
            {['Account', 'Type', 'Plan', 'Until', ''].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows === null ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-brand mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">{q ? 'No matches' : 'No paid accounts yet. Search to find one.'}</td></tr>
            ) : rows.map((a) => (
              <tr key={`${a.kind}-${a.id}`}>
                <td className="px-4 py-3"><p className="font-medium text-gray-900 dark:text-white">{a.name}</p><p className="text-xs text-gray-500">{a.email}</p></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.kind === 'EMPLOYER' ? 'Employer' : 'Event host'}</td>
                <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${active(a) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{active(a) ? a.plan : 'FREE'}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{active(a) ? fmt(a.planExpiresAt) : '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(a)} className="px-2.5 py-1 text-xs font-semibold rounded bg-brand/10 text-brand">Grant / extend</button>
                  {active(a) && (
                    <button onClick={async () => { if (!confirm(`End ${a.name}'s plan now? They drop to Free immediately.`)) return; const r = await endPlanAction({ kind: a.kind, id: a.id }); if (r.success) load(); else alert(r.error); }}
                      className="ml-2 px-2.5 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-700">End now</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <GrantDialog account={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function GrantDialog({ account, onClose, onDone }: { account: PlanAccount; onClose: () => void; onDone: () => void }) {
  const plans = account.kind === 'EMPLOYER' ? ['GROWTH', 'PRO', 'SCALE'] : ['PRO'];
  const [plan, setPlan] = useState(active(account) && plans.includes(account.plan) ? account.plan : plans[0]);
  const [days, setDays] = useState(30);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await grantPlanAction({ kind: account.kind, id: account.id, plan, days, amountRupees: Number(amount || 0), reference });
    setBusy(false);
    if (r.success) onDone(); else setError(r.error ?? 'Failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl p-5 space-y-3 shadow-2xl">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Grant plan · {account.name}</h2>
        <p className="text-xs text-gray-500">Same plan and still active: the days are added to the current end date. Otherwise it starts today.</p>
        <label className="block text-xs font-semibold text-gray-500">Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={`${input} w-full mt-1`}>{plans.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-gray-500">Days
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} w-full mt-1`}>{[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-gray-500">Amount received, incl. GST (₹, 0 if complimentary)
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-full mt-1`} />
        </label>
        <label className="block text-xs font-semibold text-gray-500">Reference (invoice no., UPI ref or reason)
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} required className={`${input} w-full mt-1`} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600">Cancel</button>
          <button disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Grant</button>
        </div>
      </form>
    </div>
  );
}

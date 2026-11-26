'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { notify } from '@/components/Toast';
import { endPlanAction, grantPlanAction, listPlanAccountsAction, type PlanAccount } from './actions';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–');
const active = (a: PlanAccount) => a.plan !== 'FREE' && !!a.planExpiresAt && new Date(a.planExpiresAt) > new Date();
const input = 'min-h-[38px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand';
const PLAN_LABEL: Record<string, string> = { FREE: 'Free', GROWTH: 'Growth', PRO: 'Pro', SCALE: 'Scale', FEATURED: 'Featured (old)', PREMIUM: 'Premium (old)' };
const planOf = (a: PlanAccount) => (active(a) ? a.plan : 'FREE');
const daysLeft = (a: PlanAccount) => Math.ceil((new Date(a.planExpiresAt!).getTime() - Date.now()) / 864e5);

/** One tab per portal that can hold a paid plan. Readers have no paid plan yet; the tab is where it will be managed. */
const TABS = [
  { key: 'employers', label: 'Employers', kind: 'EMPLOYER' as const, noun: 'employers', billing: '/billing/employers', intro: 'Hiring portal workspaces: Growth, Pro and Scale.' },
  { key: 'hosts', label: 'Event hosts', kind: 'HOST' as const, noun: 'hosts', billing: '/billing/hosts', intro: 'Organizer portal accounts: Host Pro. Boosts and certificates are one-time purchases and are not plans.' },
  { key: 'readers', label: 'Readers', kind: null, noun: 'readers', billing: null, intro: 'Website user accounts.' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

export default function PlansAdminPage() {
  // The open tab is read from the address, which needs a Suspense boundary.
  return <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />}><Plans /></Suspense>;
}

function Plans() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const tab = TABS.find((t) => t.key === (isTab(tabParam) ? tabParam : 'employers'))!;

  const [q, setQ] = useState('');
  const [searched, setSearched] = useState('');
  const [rows, setRows] = useState<PlanAccount[] | null>(null);
  const [editing, setEditing] = useState<PlanAccount | null>(null);
  const [ending, setEnding] = useState<PlanAccount | null>(null);

  const load = async (term: string) => {
    setRows(null);
    const res = await listPlanAccountsAction(term);
    if (res.success) setRows(res.data);
    else { notify(res.error ?? "Couldn't load accounts. Refresh to try again.", 'error'); setRows([]); }
    setSearched(term);
  };
  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const endPlan = async (a: PlanAccount) => {
    setEnding(null);
    const r = await endPlanAction({ kind: a.kind, id: a.id });
    if (r.success) { notify(`${a.name} is on Free now.`, 'success'); load(searched); }
    else notify(r.error ?? "Couldn't end the plan. Try again.", 'error');
  };

  const mine = useMemo(() => (rows ?? []).filter((a) => a.kind === tab.kind), [rows, tab.kind]);
  const countFor = (kind: 'EMPLOYER' | 'HOST' | null) => (rows ?? []).filter((a) => a.kind === kind && active(a)).length;

  const columns = useMemo<Column<PlanAccount>[]>(() => [
    {
      key: 'account', header: 'Account', sortValue: (a) => a.name, searchValue: (a) => `${a.name} ${a.email}`,
      cell: (a) => <><span className="font-semibold text-gray-900 dark:text-white">{a.name}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{a.email}</span></>,
    },
    {
      key: 'plan', header: 'Plan', sortValue: (a) => planOf(a),
      cell: (a) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${active(a) ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{PLAN_LABEL[planOf(a)] ?? planOf(a)}</span>,
    },
    {
      key: 'until', header: 'Runs until', sortValue: (a) => (active(a) ? new Date(a.planExpiresAt!) : null),
      cell: (a) => active(a)
        ? <span className="whitespace-nowrap">{fmt(a.planExpiresAt)}<span className={`block text-xs ${daysLeft(a) <= 7 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>in {daysLeft(a)} day{daysLeft(a) === 1 ? '' : 's'}</span></span>
        : '–',
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (a) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <button onClick={() => setEditing(a)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={`${active(a) ? 'Extend or change' : 'Grant'} a plan for ${a.name}`}>{active(a) ? 'Extend or change' : 'Grant a plan'}</button>
          {active(a) && <button onClick={() => setEnding(a)} className="px-2.5 py-1 text-xs font-semibold rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`End the plan of ${a.name} now`}>End now</button>}
        </div>
      ),
    },
  ], []);

  const filters = useMemo<TableFilter<PlanAccount>[]>(() => [
    { key: 'plan', label: 'Plan', options: [...new Set(mine.map(planOf))].sort().map((p) => ({ value: p, label: PLAN_LABEL[p] ?? p })), matches: (a, v) => planOf(a) === v },
    { key: 'ends', label: 'Ends', options: [{ value: '7', label: 'Within 7 days' }, { value: '30', label: 'Within 30 days' }], matches: (a, v) => active(a) && daysLeft(a) <= Number(v) },
  ], [mine]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="portal-title">Plans</h1>
          <p className="portal-subtitle">Grant, extend or end a plan by hand, for customers who paid by invoice or UPI. Online (Razorpay) payments switch plans on by themselves.</p>
        </div>
        <Link href="/billing" className="btn-outline text-sm shrink-0">Billing and revenue</Link>
      </div>

      <nav aria-label="Plans by portal" className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
        {TABS.map((t) => {
          const on = t.key === tab.key;
          const n = t.kind ? countFor(t.kind) : 0;
          return (
            <button key={t.key} type="button" aria-current={on ? 'page' : undefined}
              onClick={() => router.replace(t.key === 'employers' ? pathname : `${pathname}?tab=${t.key}`, { scroll: false })}
              className={`relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${on ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
              {t.label}
              {t.kind && rows !== null && <span className="ml-1.5 text-xs text-gray-600 dark:text-gray-400 tabular-nums">{n}</span>}
              {on && <span aria-hidden className="absolute left-2 right-2 bottom-0 h-0.5 rounded-t bg-brand" />}
            </button>
          );
        })}
      </nav>

      {tab.kind === null ? (
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 max-w-2xl">
          <h2 className="portal-section-title">No reader plan yet</h2>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Website users don&rsquo;t pay for anything today, so there is nothing to grant or end here.</p>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">When paid content launches, reader subscriptions will be managed in this tab, the same way as employers and hosts: who is subscribed, until when, and manual grants for people who paid offline. Their payments will appear as their own stream under Billing and revenue.</p>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">{tab.intro}{' '}
              {searched ? `Showing accounts matching “${searched}”.` : 'Showing accounts that are or were on a paid plan. Search to find any other account.'}
            </p>
            {tab.billing && <Link href={tab.billing} className="text-sm font-semibold text-brand hover:underline shrink-0">Payments and revenue for {tab.label.toLowerCase()}</Link>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); load(q.trim()); }} className="flex gap-2 max-w-lg" role="search">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden />
              <label htmlFor="plan-search" className="sr-only">Find any account</label>
              <input id="plan-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find any account by name or email" className={`${input} w-full pl-9`} />
            </div>
            <button className="btn-brand text-sm !min-h-[38px] !py-0">Search</button>
            {searched && <button type="button" onClick={() => { setQ(''); load(''); }} className="px-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Clear</button>}
          </form>

          <DataTable tableId={`plans-${tab.key}`} noun={tab.noun} rows={mine} rowKey={(a) => `${a.kind}-${a.id}`} columns={columns} filters={filters} loading={rows === null} pageSize={20}
            searchPlaceholder="Filter this list"
            empty={searched
              ? { title: 'No accounts match', description: 'Check the spelling, or try the email address.' }
              : { title: `No ${tab.noun} on a paid plan yet`, description: 'Search above to find an account and grant it a plan.' }} />
        </>
      )}

      {editing && <GrantDialog account={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); notify('Plan updated.', 'success'); load(searched); }} />}
      <ConfirmModal
        open={!!ending}
        onClose={() => setEnding(null)}
        onConfirm={() => { if (ending) endPlan(ending); }}
        title="End plan now"
        message={ending ? `End the ${PLAN_LABEL[ending.plan] ?? ending.plan} plan of ${ending.name} now? They drop to Free straight away. No refund is made; use Billing for refunds.` : ''}
        confirmLabel="End plan"
      />
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
        <p className="text-xs text-gray-600 dark:text-gray-400">Same plan and still active: the days are added to the current end date. Otherwise it starts today.</p>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={`${input} w-full mt-1`}>{plans.map((p) => <option key={p} value={p}>{PLAN_LABEL[p] ?? p}</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Days
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} w-full mt-1`}>{[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Amount received, incl. GST (₹, 0 if complimentary)
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-full mt-1`} />
        </label>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Reference (invoice no., UPI ref or reason)
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} required className={`${input} w-full mt-1`} />
        </label>
        {error && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600">Cancel</button>
          <button disabled={busy} className="btn-brand text-sm disabled:opacity-50 gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Grant</button>
        </div>
      </form>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, History, Loader2, RotateCcw, Save, X } from 'lucide-react';
import { EMPLOYER_KEYS, HOST_KEYS, HOST_UNLIMITED_EVENTS, MAX_FOUNDING_DISCOUNT_PCT, MAX_GRACE_DAYS, MAX_TICKET_FEE_PCT, MAX_TRIAL_DAYS, catalogChanges, validateCatalog, type PlanCatalog } from '@udyaibase/utils/catalog';
import { PACK_KEYS, PACKS } from '@udyaibase/utils/funding-packs';
import { PAID_PLANS, PLANS } from '@udyaibase/utils/employer-plans';
import { HOST_PLANS } from '@udyaibase/utils/host-plans';
import { notify } from '@/components/Toast';
import { ask } from '@/components/Ask';
import { card } from '@/components/billing/parts';
import PlanPricingPreview from '@/components/billing/PlanPricingPreview';
import { cancelScheduledPricesAction, restorePlanPricesAction, savePlanPricesAction } from '@/app/(dashboard)/billing/plan-prices/actions';
import type { CatalogVersionRow, PlanPricesView } from '@/lib/billing/plan-prices-load';

export type Tab = 'employer' | 'host' | 'funding' | 'rules';
const TABS: { key: Tab; label: string }[] = [{ key: 'employer', label: 'Hiring plans' }, { key: 'host', label: 'Event host plans' }, { key: 'funding', label: 'Funding data packs' }, { key: 'rules', label: 'Trial, founding price and fees' }];
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const fromIstInput = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : '');
const clone = (c: PlanCatalog): PlanCatalog => JSON.parse(JSON.stringify(c));

/** Read and write one value of the catalog by its path, like "employer.PRO.pricePaise". */
const get = (c: PlanCatalog, path: string): unknown => path.split('.').reduce<any>((o, k) => o?.[k], c);
function put(c: PlanCatalog, path: string, value: unknown): PlanCatalog {
  const next = clone(c);
  const keys = path.split('.');
  let o: any = next;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
  return next;
}

/** Plans & prices: edit the catalog, see what will change, then save it now or schedule it. */
export default function PlanPricesClient({ view }: { view: PlanPricesView }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('employer');
  const [draft, setDraft] = useState<PlanCatalog>(() => clone(view.inForce));
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // After a save the page reloads with the new catalog in force: start the form again from it.
  const inForceKey = JSON.stringify(view.inForce);
  useEffect(() => { setDraft(clone(view.inForce)); }, [inForceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const checked = useMemo(() => validateCatalog(draft), [draft]);
  const changes = useMemo(() => catalogChanges(view.inForce, draft), [view.inForce, draft]);
  const badPath = checked.ok ? null : checked.path;

  const tick = (path: string, label: string) => {
    const on = get(draft, path) as boolean;
    const changed = get(view.inForce, path) !== on;
    return (
      <label className={`inline-flex items-center gap-2 text-sm rounded px-1 ${badPath === path ? 'ring-2 ring-red-500' : changed ? 'ring-2 ring-amber-500' : ''}`}>
        <input id={path} type="checkbox" checked={on} aria-label={label} aria-invalid={badPath === path ? true : undefined} onChange={(e) => setDraft((d) => put(d, path, e.target.checked))} />
        <span className="text-gray-700 dark:text-gray-300">{on ? 'Included' : 'Not included'}</span>
      </label>
    );
  };
  const num = (path: string, opts: { money?: boolean; nullable?: boolean; disabled?: boolean; decimal?: boolean; placeholder?: string; label: string }) => {
    const raw = get(draft, path) as number | null;
    const shown = raw === null ? '' : opts.money ? String(raw / 100) : String(raw);
    const changed = JSON.stringify(get(view.inForce, path)) !== JSON.stringify(raw);
    return (
      <input id={path} type="number" inputMode={opts.decimal ? 'decimal' : 'numeric'} min={0} step={opts.decimal ? 0.1 : 1} value={shown} disabled={opts.disabled} aria-label={opts.label} aria-invalid={badPath === path ? true : undefined}
        placeholder={opts.placeholder ?? (opts.nullable ? 'Unlimited' : undefined)}
        onChange={(e) => {
          const v = e.target.value.trim();
          const n = v === '' ? (opts.nullable ? null : NaN) : opts.decimal ? Number(v) : Math.round(Number(v) * (opts.money ? 100 : 1));
          setDraft((d) => put(d, path, n));
        }}
        className={`input-field text-sm tabular-nums !py-1.5 w-full min-w-[96px] ${badPath === path ? '!border-red-500' : changed ? '!border-amber-500' : ''}`} />
    );
  };
  const lines = (path: string, label: string) => {
    const changed = JSON.stringify(get(view.inForce, path)) !== JSON.stringify(get(draft, path));
    return (
      <textarea id={path} rows={5} aria-label={label} aria-invalid={badPath === path ? true : undefined} value={(get(draft, path) as string[]).join('\n')}
        onChange={(e) => setDraft((d) => put(d, path, e.target.value.split('\n')))}
        className={`input-field text-xs leading-relaxed w-full min-w-[200px] ${badPath === path ? '!border-red-500' : changed ? '!border-amber-500' : ''}`} />
    );
  };

  const th = 'px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap';
  const rowHead = 'px-3 py-2 text-sm font-medium text-gray-900 dark:text-white align-top whitespace-nowrap';
  const cell = 'px-3 py-2 align-top';
  const subs = (n: number | undefined) => (n ? `${n.toLocaleString('en-IN')} paying now` : 'Nobody paying now');

  const restore = async (v: CatalogVersionRow | 'BUILT_IN') => {
    const what = v === 'BUILT_IN' ? 'the prices and limits built into the product' : `the version from ${when(v.effectiveFrom)}`;
    if (!(await ask({ title: 'Restore these prices?', message: `Customers will see ${what} from now on. It is saved as a new version, so nothing in the history is lost.`, confirmLabel: 'Restore' }))) return;
    setBusy(v === 'BUILT_IN' ? 'BUILT_IN' : v.id);
    const r = await restorePlanPricesAction(v === 'BUILT_IN' ? 'BUILT_IN' : v.id);
    setBusy(null);
    if (!r.success) { notify(r.error, 'error'); return; }
    notify(`Restored. ${r.changes} value${r.changes === 1 ? '' : 's'} changed.`, 'success');
    router.refresh();
  };
  const cancel = async (v: CatalogVersionRow) => {
    if (!(await ask({ title: 'Cancel this scheduled change?', message: `The change set for ${when(v.effectiveFrom)} is removed. Prices stay as they are.`, confirmLabel: 'Cancel the change', danger: true }))) return;
    setBusy(v.id);
    const r = await cancelScheduledPricesAction(v.id);
    setBusy(null);
    if (!r.success) { notify(r.error, 'error'); return; }
    notify('Scheduled change cancelled.', 'success');
    router.refresh();
  };

  const scheduled = view.versions.filter((v) => v.state === 'scheduled');

  return (
    <div className="space-y-5">
      {scheduled.length > 0 && (
        <div role="status" className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
          <p className="font-medium inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" aria-hidden /> {scheduled.length === 1 ? 'A change is' : `${scheduled.length} changes are`} scheduled.</p>
          <ul className="mt-1 space-y-1">
            {scheduled.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{when(v.effectiveFrom)}: {v.note} ({v.changes.length} value{v.changes.length === 1 ? '' : 's'})</span>
                <button type="button" disabled={busy !== null} onClick={() => cancel(v)} className="font-semibold underline disabled:opacity-50">Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label="Which plans" className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`relative px-3 py-2.5 text-sm font-medium ${tab === t.key ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            {t.label}
            {changes.some((c) => c.path.startsWith(`${t.key}.`) || (t.key === 'host' && c.path.startsWith('boost.'))) && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" aria-label="has unsaved changes" />}
            {tab === t.key && <span aria-hidden className="absolute left-2 right-2 bottom-0 h-0.5 rounded-t bg-brand" />}
          </button>
        ))}
      </div>

      {tab === 'employer' && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[860px]">
            <caption className="sr-only">Hiring plans: prices, limits and feature lines</caption>
            <thead><tr className="border-b border-gray-100 dark:border-gray-800">
              <th scope="col" className={th}>Per plan</th>
              {EMPLOYER_KEYS.map((k) => <th scope="col" key={k} className={th}><span className="block text-sm font-semibold text-gray-900 dark:text-white">{PLANS[k].name}</span>{k === 'FREE' ? 'Everyone starts here' : subs(view.subscribers.employer[k])}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <tr><th scope="row" className={rowHead}>Monthly price (₹, before GST)</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{num(`employer.${k}.pricePaise`, { money: true, disabled: k === 'FREE', label: `${PLANS[k].name} monthly price` })}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Yearly price (₹, before GST)</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{num(`employer.${k}.annualPricePaise`, { money: true, disabled: k === 'FREE', label: `${PLANS[k].name} yearly price` })}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Open jobs at a time</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{num(`employer.${k}.maxActiveJobs`, { label: `${PLANS[k].name} open jobs` })}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>AI reviews a month</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{num(`employer.${k}.aiScreensPerPeriod`, { label: `${PLANS[k].name} AI reviews` })}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Intro requests a month</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{num(`employer.${k}.introRequestsPerPeriod`, { label: `${PLANS[k].name} intro requests` })}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Team seats</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{num(`employer.${k}.maxSeats`, { nullable: true, label: `${PLANS[k].name} team seats` })}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Featured badge and higher placement<span className="block text-xs font-normal text-gray-600 dark:text-gray-400">On every open job</span></th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{tick(`employer.${k}.featured`, `${PLANS[k].name}: featured badge`)}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Jobs in the newsletter and socials</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{tick(`employer.${k}.newsletter`, `${PLANS[k].name}: newsletter and socials`)}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Widget without Udyaibase branding</th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{tick(`employer.${k}.customBranding`, `${PLANS[k].name}: widget without branding`)}</td>)}</tr>
              <tr><th scope="row" className={rowHead}>Feature lines<span className="block text-xs font-normal text-gray-600 dark:text-gray-400">One per line, as shown on pricing</span></th>{EMPLOYER_KEYS.map((k) => <td key={k} className={cell}>{lines(`employer.${k}.features`, `${PLANS[k].name} feature lines`)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'host' && (
        <div className="space-y-5">
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full min-w-[640px]">
              <caption className="sr-only">Event host plans: prices, limits and feature lines</caption>
              <thead><tr className="border-b border-gray-100 dark:border-gray-800">
                <th scope="col" className={th}>Per plan</th>
                {HOST_KEYS.map((k) => <th scope="col" key={k} className={th}><span className="block text-sm font-semibold text-gray-900 dark:text-white">{HOST_PLANS[k].name}</span>{k === 'FREE' ? 'Everyone starts here' : subs(view.subscribers.host[k])}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                <tr><th scope="row" className={rowHead}>Monthly price (₹, before GST)</th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{num(`host.${k}.pricePaise`, { money: true, disabled: k === 'FREE', label: `Host ${HOST_PLANS[k].name} monthly price` })}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Yearly price (₹, before GST)</th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{num(`host.${k}.annualPricePaise`, { money: true, disabled: k === 'FREE', label: `Host ${HOST_PLANS[k].name} yearly price` })}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Upcoming events at a time<span className="block text-xs font-normal text-gray-600 dark:text-gray-400">{HOST_UNLIMITED_EVENTS.toLocaleString('en-IN')} or more shows as “unlimited”</span></th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{num(`host.${k}.maxUpcomingEvents`, { label: `Host ${HOST_PLANS[k].name} upcoming events` })}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Registrations per event</th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{num(`host.${k}.registrationsPerEvent`, { label: `Host ${HOST_PLANS[k].name} registrations per event` })}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Teammates</th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{num(`host.${k}.teamMembers`, { label: `Host ${HOST_PLANS[k].name} teammates` })}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Promo emails a month</th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{num(`host.${k}.promoEmailsPerPeriod`, { label: `Host ${HOST_PLANS[k].name} promo emails` })}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Every event featured</th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{tick(`host.${k}.featuredEvents`, `Host ${HOST_PLANS[k].name}: every event featured`)}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Event pages without Udyaibase branding</th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{tick(`host.${k}.removeBranding`, `Host ${HOST_PLANS[k].name}: no branding`)}</td>)}</tr>
                <tr><th scope="row" className={rowHead}>Feature lines<span className="block text-xs font-normal text-gray-600 dark:text-gray-400">One per line, as shown on pricing</span></th>{HOST_KEYS.map((k) => <td key={k} className={cell}>{lines(`host.${k}.features`, `Host ${HOST_PLANS[k].name} feature lines`)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <section className={`${card} p-4`} aria-labelledby="boost-title">
            <h2 id="boost-title" className="portal-section-title">Event Boost</h2>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">A one-time purchase for a single event.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 max-w-xl">
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Price (₹, before GST)<span className="block mt-1.5">{num('boost.pricePaise', { money: true, label: 'Event Boost price' })}</span></label>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Registrations for the boosted event<span className="block mt-1.5">{num('boost.registrationsPerEvent', { label: 'Event Boost registrations' })}</span></label>
            </div>
          </section>
        </div>
      )}

      {tab === 'funding' && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[560px]">
            <caption className="sr-only">Funding data packs: sizes and prices</caption>
            <thead><tr className="border-b border-gray-100 dark:border-gray-800">
              <th scope="col" className={th}>Pack</th><th scope="col" className={th}>Startups in the file</th><th scope="col" className={th}>Price (₹, GST included)</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {PACK_KEYS.map((k) => (
                <tr key={k}>
                  <th scope="row" className={rowHead}>{PACKS[k].name}<span className="block text-xs font-normal text-gray-600 dark:text-gray-400">{PACKS[k].blurb}</span></th>
                  <td className={cell}>{k === 'FULL' ? <span className="text-sm text-gray-600 dark:text-gray-400">Every startup</span> : num(`funding.${k}.limit`, { label: `${PACKS[k].name} pack size` })}</td>
                  <td className={cell}>{num(`funding.${k}.totalPaise`, { money: true, label: `${PACKS[k].name} pack price` })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rules' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={`${card} p-4`} aria-labelledby="rule-trial">
            <h2 id="rule-trial" className="portal-section-title">Hiring free trial</h2>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Starts by itself with a workspace’s first published job. One per company.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Length (days)<span className="block mt-1.5">{num('rules.employer.trialDays', { label: 'Trial length in days' })}</span><span className="block mt-1 text-xs font-normal text-gray-600 dark:text-gray-400">0 to {MAX_TRIAL_DAYS}. 0 switches the trial off.</span></label>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Plan it gives
                <select id="rules.employer.trialPlan" value={draft.rules.employer.trialPlan} onChange={(e) => setDraft((d) => put(d, 'rules.employer.trialPlan', e.target.value))} aria-invalid={badPath === 'rules.employer.trialPlan' ? true : undefined}
                  className={`input-field text-sm !py-1.5 mt-1.5 ${draft.rules.employer.trialPlan !== view.inForce.rules.employer.trialPlan ? '!border-amber-500' : ''}`}>
                  {PAID_PLANS.map((k) => <option key={k} value={k}>{PLANS[k].name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">AI reviews included<span className="block mt-1.5">{num('rules.employer.trialAiScreens', { label: 'AI reviews in the trial' })}</span></label>
            </div>
          </section>

          <section className={`${card} p-4`} aria-labelledby="rule-grace">
            <h2 id="rule-grace" className="portal-section-title">Grace days after a plan ends</h2>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">A paid plan keeps working this long after its end date, so a late renewal loses nothing. 0 to {MAX_GRACE_DAYS}.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Hiring plans (days)<span className="block mt-1.5">{num('rules.employer.graceDays', { label: 'Hiring grace days' })}</span></label>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Host Pro (days)<span className="block mt-1.5">{num('rules.host.graceDays', { label: 'Host grace days' })}</span></label>
            </div>
          </section>

          {(['employer', 'host'] as const).map((who) => (
            <section key={who} className={`${card} p-4`} aria-labelledby={`rule-founding-${who}`}>
              <h2 id={`rule-founding-${who}`} className="portal-section-title">{who === 'employer' ? 'Hiring founding price' : 'Host founding price'}</h2>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">A lower yearly price for the first {who === 'employer' ? 'workspaces' : 'hosts'} to buy a year. Those who already have it keep it while their plan never lapses.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Places<span className="block mt-1.5">{num(`rules.${who}.foundingLimit`, { label: `${who} founding places` })}</span><span className="block mt-1 text-xs font-normal text-gray-600 dark:text-gray-400">0 closes it to newcomers.</span></label>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Discount (%)<span className="block mt-1.5">{num(`rules.${who}.foundingDiscountPct`, { label: `${who} founding discount percent` })}</span><span className="block mt-1 text-xs font-normal text-gray-600 dark:text-gray-400">0 to {MAX_FOUNDING_DISCOUNT_PCT}.</span></label>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Price holds for (months)<span className="block mt-1.5">{num(`rules.${who}.foundingLockMonths`, { label: `${who} founding months` })}</span></label>
              </div>
            </section>
          ))}

          <section className={`${card} p-4`} aria-labelledby="rule-cert">
            <h2 id="rule-cert" className="portal-section-title">Event certificates</h2>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">A one-time purchase for one event, for hosts not on Pro.</p>
            <label className="mt-3 block max-w-xs text-sm font-medium text-gray-900 dark:text-white">Price (₹, before GST)<span className="block mt-1.5">{num('rules.certificatePricePaise', { money: true, label: 'Certificates price' })}</span></label>
          </section>

          <section className={`${card} p-4`} aria-labelledby="rule-fee">
            <h2 id="rule-fee" className="portal-section-title">Ticket platform fee</h2>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Our share of each paid ticket. It applies to tickets sold after the change; tickets already sold keep the fee they were sold with.</p>
            <label className="mt-3 block max-w-xs text-sm font-medium text-gray-900 dark:text-white">Fee (%)<span className="block mt-1.5">{num('rules.ticketFeePct', { nullable: true, decimal: true, placeholder: 'Server setting', label: 'Ticket fee percent' })}</span><span className="block mt-1 text-xs font-normal text-gray-600 dark:text-gray-400">0 to {MAX_TICKET_FEE_PCT}. Empty uses the server setting (5% unless it was changed there).</span></label>
          </section>
        </div>
      )}

      <PlanPricingPreview catalog={draft} inForce={view.inForce} tab={tab} valid={checked.ok} />

      <div className={`${card} p-4 flex flex-wrap items-center gap-3 sticky bottom-3`}>
        <p role="status" aria-live="polite" className={`text-sm ${!checked.ok ? 'font-medium text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
          {!checked.ok ? checked.error : changes.length ? `${changes.length} value${changes.length === 1 ? '' : 's'} changed. Nothing is live until you save.` : 'These are the prices and limits customers see now.'}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {changes.length > 0 && <button type="button" onClick={() => setDraft(clone(view.inForce))} className="btn-outline text-sm">Discard changes</button>}
          <button type="button" disabled={!checked.ok || changes.length === 0} onClick={() => setReview(true)} className="btn-brand text-sm gap-2 disabled:opacity-50"><Save className="w-4 h-4" aria-hidden /> Review and save</button>
        </div>
      </div>

      <section className={`${card} p-4`} aria-labelledby="history-title">
        <h2 id="history-title" className="portal-section-title inline-flex items-center gap-2"><History className="w-4 h-4" aria-hidden /> History</h2>
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {view.versions.filter((v) => v.state !== 'scheduled').map((v) => (
            <li key={v.id} className="py-3 flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[240px]">
                <p className="text-sm font-medium text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
                  {when(v.effectiveFrom)}
                  {v.state === 'in_force' && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">In force</span>}
                  {!v.valid && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">Skipped: no longer valid</span>}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{v.note}{v.createdByEmail ? ` · ${v.createdByEmail}` : ''}</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {v.changes.slice(0, 4).map((c) => `${c.label} ${c.from} → ${c.to}`).join(' · ')}{v.changes.length > 4 ? ` · and ${v.changes.length - 4} more` : ''}{v.changes.length === 0 && v.valid ? 'No difference from the version before' : ''}
                </p>
              </div>
              {v.state === 'past' && v.valid && (
                <button type="button" disabled={busy !== null} onClick={() => restore(v)} aria-label={`Restore the version from ${when(v.effectiveFrom)}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
                  {busy === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />} Restore
                </button>
              )}
            </li>
          ))}
          <li className="py-3 flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[240px]">
              <p className="text-sm font-medium text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
                Built into the product
                {view.inForceId === null && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">In force</span>}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">The prices and limits the product ships with. They apply until a version is saved here.</p>
            </div>
            {view.inForceId !== null && (
              <button type="button" disabled={busy !== null} onClick={() => restore('BUILT_IN')} aria-label="Restore the built-in prices and rules" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
                {busy === 'BUILT_IN' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />} Restore
              </button>
            )}
          </li>
        </ul>
      </section>

      {review && checked.ok && <ReviewSheet view={view} draft={checked.data} onClose={() => setReview(false)} onSaved={() => { setReview(false); router.refresh(); }} />}
    </div>
  );
}

function ReviewSheet({ view, draft, onClose, onSaved }: { view: PlanPricesView; draft: PlanCatalog; onClose: () => void; onSaved: () => void }) {
  const changes = useMemo(() => catalogChanges(view.inForce, draft), [view.inForce, draft]);
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Who pays for a plan whose price or limits are changing.
  const touched = new Set(changes.map((c) => c.path.split('.').slice(0, 2).join('.')));
  const affected = [...touched].reduce((n, p) => {
    const [group, key] = p.split('.');
    return n + (group === 'employer' ? view.subscribers.employer[key] ?? 0 : group === 'host' ? view.subscribers.host[key] ?? 0 : 0);
  }, 0);
  const limitsDown = changes.some((c) => !/Paise$|features$/.test(c.path) && Number(c.to.replace(/[^\d]/g, '') || Infinity) < Number(c.from.replace(/[^\d]/g, '') || Infinity));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'later' && !at) { setError('Choose when the change starts.'); return; }
    setSaving(true); setError('');
    const r = await savePlanPricesAction(draft, { effectiveFrom: mode === 'later' ? fromIstInput(at) : null, note });
    setSaving(false);
    if (!r.success) { setError(r.error); return; }
    notify(r.scheduled ? `Scheduled. ${r.changes} value${r.changes === 1 ? '' : 's'} will change at the time you set.` : `Saved. ${r.changes} value${r.changes === 1 ? ' is' : 's are'} live now.`, 'success');
    onSaved();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Review and save" className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <form onSubmit={save} noValidate className={`${card} mx-auto w-full max-w-2xl p-5 space-y-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="portal-section-title">Review and save</h2>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900"><tr className="text-xs text-left text-gray-600 dark:text-gray-400">
              <th scope="col" className="px-3 py-2 font-medium">What</th><th scope="col" className="px-3 py-2 font-medium">Now</th><th scope="col" className="px-3 py-2 font-medium">After</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {changes.map((c) => <tr key={c.path}><td className="px-3 py-2 text-gray-900 dark:text-white">{c.label}</td><td className="px-3 py-2 tabular-nums text-gray-600 dark:text-gray-400">{c.from}</td><td className="px-3 py-2 tabular-nums font-semibold text-gray-900 dark:text-white">{c.to}</td></tr>)}
            </tbody>
          </table>
        </div>
        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc pl-5">
          <li>A new price is charged on payments made after the change. {affected > 0 ? `${affected.toLocaleString('en-IN')} account${affected === 1 ? ' is' : 's are'} paying for a plan in this list; what they already paid is not touched.` : 'Nobody is paying for a plan in this list right now.'}</li>
          <li>New limits apply to everyone on the plan as soon as the change starts{limitsDown ? ', including the limit you are lowering: accounts above it keep what they have but can’t add more.' : '.'}</li>
          <li>Pricing pages update within a minute. Every checkout reads the price fresh.</li>
        </ul>
        <fieldset>
          <legend className="block text-sm font-medium text-gray-900 dark:text-white">When</legend>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-2"><input type="radio" name="when" checked={mode === 'now'} onChange={() => setMode('now')} /> Now</label>
            <label className="inline-flex items-center gap-2"><input type="radio" name="when" checked={mode === 'later'} onChange={() => setMode('later')} /> At a set time</label>
            {mode === 'later' && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Start time, India time" className="input-field text-sm !w-auto" />}
            {mode === 'later' && <span className="text-xs text-gray-600 dark:text-gray-400">India time</span>}
          </div>
        </fieldset>
        <div>
          <label htmlFor="catalog-note" className="block text-sm font-medium text-gray-900 dark:text-white">Why is this changing?</label>
          <input id="catalog-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="input-field text-sm mt-1.5" placeholder="New year pricing" aria-describedby="catalog-note-hint" />
          <p id="catalog-note-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">Kept in the history with your name and the time.</p>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline text-sm">Keep editing</button>
          <button type="submit" disabled={saving} className="btn-brand text-sm gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}{mode === 'later' ? 'Schedule the change' : 'Save and make live'}</button>
        </div>
      </form>
    </div>
  );
}

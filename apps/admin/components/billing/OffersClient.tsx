'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Gift, Loader2, Pause, Pencil, Play, Plus, Sparkles, Square, Tag, Trash2, Users, X } from 'lucide-react';
import {
  AUDIENCE_HELP, AUDIENCE_LABEL, BENEFIT_LABEL, CYCLE_LABEL, MAX_PERCENT_OFF, OFFER_BENEFITS, OFFER_CYCLES, OFFER_MAX_DAYS, OFFER_PORTALS, OFFER_STATE_LABEL, OFFER_TEMPLATES, OFFER_TRIGGERS, PORTAL_LABEL, TRIGGER_LABEL,
  audiencesFor, benefitPhrase, isDiscount, offerPlanName, offerPlanPricePaise, offerPlansFor, suggestOfferCode,
  type OfferAudience, type OfferBenefit, type OfferCycle, type OfferField, type OfferPortal, type OfferState, type OfferTemplate, type OfferTrigger,
} from '@udyaibase/utils/offers';
import { notify } from '@/components/Toast';
import { ask } from '@/components/Ask';
import { card } from '@/components/billing/parts';
import { deleteOfferAction, moveOfferAction, offerClaimsAction, saveOfferAction, type OfferMove } from '@/app/(dashboard)/billing/offers/actions';
import type { OfferRow, RedemptionRow } from '@/lib/billing/offers-load';

const PILL: Record<OfferState, string> = {
  running: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  scheduled: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  paused: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  full: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  finished: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  ended: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** A datetime-local value is a wall-clock time; offers run on India time whatever the admin's own clock says. */
const toIstInput = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 36e5).toISOString().slice(0, 16);
const fromIstInput = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : '');

interface Draft { name: string; headline: string; portal: OfferPortal; benefit: OfferBenefit; percentOff: string; amountOffRupees: string; cycle: OfferCycle; trigger: OfferTrigger; code: string; plan: string; benefitDays: string; audience: OfferAudience; startsAt: string; endsAt: string; maxRedemptions: string; showPublicly: boolean }

/** The next full hour, as the default start. */
function nextHour(): Date {
  const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
  return start;
}
function blank(): Draft {
  const start = nextHour();
  return { name: '', headline: '', portal: 'EMPLOYER', benefit: 'FREE_PLAN', percentOff: '25', amountOffRupees: '500', cycle: 'ANY', trigger: 'AUTO', code: '', plan: 'PRO', benefitDays: '90', audience: 'VERIFIED_STARTUPS', startsAt: toIstInput(start.toISOString()), endsAt: toIstInput(new Date(start.getTime() + 30 * 864e5).toISOString()), maxRedemptions: '100', showPublicly: true };
}
/** A ready-made offer, with its dates set from now and a fresh code where it uses one. */
function fromTemplate(tpl: OfferTemplate): Draft {
  const start = nextHour();
  return {
    name: tpl.name, headline: tpl.headline, portal: tpl.portal, trigger: tpl.trigger, code: tpl.trigger === 'CODE' ? suggestOfferCode(tpl.codePrefix) : '',
    benefit: tpl.benefit ?? 'FREE_PLAN', percentOff: String(tpl.percentOff ?? 25), amountOffRupees: String(Math.round((tpl.amountOffPaise ?? 50000) / 100)), cycle: tpl.cycle ?? 'ANY',
    plan: tpl.plan, benefitDays: String(tpl.benefitDays || 90), audience: tpl.audience,
    startsAt: toIstInput(start.toISOString()), endsAt: toIstInput(new Date(start.getTime() + tpl.runsForDays * 864e5).toISOString()),
    maxRedemptions: tpl.maxRedemptions == null ? '' : String(tpl.maxRedemptions), showPublicly: tpl.trigger === 'AUTO',
  };
}
const draftOf = (o: OfferRow): Draft => ({
  name: o.name, headline: o.headline, portal: o.portal as OfferPortal, trigger: o.trigger as OfferTrigger, code: o.code ?? '', plan: o.plan, benefitDays: String(o.benefitDays || 90), audience: o.audience as OfferAudience,
  benefit: o.benefit as OfferBenefit, percentOff: String(o.percentOff ?? 25), amountOffRupees: String(Math.round((o.amountOffPaise ?? 50000) / 100)), cycle: o.cycle as OfferCycle,
  startsAt: toIstInput(o.startsAt), endsAt: toIstInput(o.endsAt), maxRedemptions: o.maxRedemptions == null ? '' : String(o.maxRedemptions), showPublicly: o.showPublicly,
});

/** Offers: create, schedule, pause and end them, and see who claimed each one. */
export default function OffersClient({ offers, planPrices }: { offers: OfferRow[]; planPrices: Record<string, number> }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft; claimed: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [claims, setClaims] = useState<{ offer: OfferRow; rows: RedemptionRow[] | null } | null>(null);
  const [picking, setPicking] = useState(false);

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); notify(`Copied ${code}.`, 'success'); }
    catch { notify(`Couldn't copy. The code is ${code}.`, 'error'); }
  };

  const move = async (o: OfferRow, m: OfferMove) => {
    if (m === 'end') {
      const ok = await ask({
        title: 'End this offer?', danger: true, confirmLabel: 'End offer',
        message: `“${o.name}” stops for good: nobody new can claim it and it can't be restarted. ${o.redeemedCount > 0 ? `The ${o.redeemedCount.toLocaleString('en-IN')} account${o.redeemedCount === 1 ? '' : 's'} that already claimed keep${o.redeemedCount === 1 ? 's' : ''} the free period.` : ''}`,
      });
      if (!ok) return;
    }
    setBusy(o.id);
    const r = await moveOfferAction(o.id, m);
    setBusy(null);
    if (!r.success) { notify(r.error, 'error'); return; }
    notify(r.message, 'success');
    router.refresh();
  };

  const remove = async (o: OfferRow) => {
    if (!(await ask({ title: 'Delete this draft?', message: `“${o.name}” is removed. It never ran, so nothing else changes.`, confirmLabel: 'Delete', danger: true }))) return;
    setBusy(o.id);
    const r = await deleteOfferAction(o.id);
    setBusy(null);
    if (!r.success) { notify(r.error, 'error'); return; }
    notify('Draft deleted.', 'success');
    router.refresh();
  };

  const showClaims = async (o: OfferRow) => {
    setClaims({ offer: o, rows: null });
    const r = await offerClaimsAction(o.id);
    if (!r.success) { notify(r.error, 'error'); setClaims(null); return; }
    setClaims({ offer: o, rows: r.data });
  };

  const action = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 whitespace-nowrap disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {offers.length === 0 ? 'No offers yet.' : `${offers.filter((o) => o.state === 'running').length} running, ${offers.filter((o) => o.state === 'scheduled').length} scheduled, ${offers.length} in all.`}
        </p>
        <button type="button" onClick={() => setPicking(true)} className="btn-brand text-sm gap-2"><Plus className="w-4 h-4" aria-hidden /> New offer</button>
      </div>

      {offers.length === 0 && (
        <div className={`${card} p-8 text-center`}>
          <Gift className="w-8 h-8 mx-auto text-gray-400" aria-hidden />
          <p className="mt-3 font-semibold text-gray-900 dark:text-white">Run your first offer</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">For example: Pro free for 3 months for the first 100 founders who verify their startup. Press New offer to start from a ready-made one.</p>
        </div>
      )}

      <ul className="space-y-3">
        {offers.map((o) => {
          const pct = o.maxRedemptions ? Math.min(100, Math.round((o.redeemedCount / o.maxRedemptions) * 100)) : null;
          const working = busy === o.id;
          return (
            <li key={o.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{o.name}</span>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${PILL[o.state]}`}>{OFFER_STATE_LABEL[o.state]}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{o.headline}</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {PORTAL_LABEL[o.portal as OfferPortal] ?? o.portal} · {benefitPhrase(o)} · {AUDIENCE_LABEL[o.audience as OfferAudience] ?? o.audience} · {o.trigger === 'CODE' ? 'Claimed with a code' : o.showPublicly ? 'Automatic, shown on the sign-up page' : 'Automatic, not advertised'}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{when(o.startsAt)} to {when(o.endsAt)} (India time)</p>
                  {o.code && (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 pl-2.5 pr-1 py-1">
                      <Tag className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" aria-hidden />
                      <span className="font-mono text-sm font-semibold tracking-wider text-gray-900 dark:text-white">{o.code}</span>
                      <button type="button" onClick={() => copyCode(o.code!)} aria-label={`Copy the code ${o.code}`} className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"><Copy className="w-3.5 h-3.5" aria-hidden /></button>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {working && <Loader2 className="w-4 h-4 animate-spin text-gray-500" aria-label="Working" />}
                  {o.status === 'DRAFT' && <button type="button" disabled={working} onClick={() => move(o, 'start')} className={`${action} !bg-green-600 !text-white hover:!bg-green-700`}><Play className="w-3.5 h-3.5" aria-hidden /> Start</button>}
                  {o.status === 'ACTIVE' && (o.state === 'running' || o.state === 'scheduled') && <button type="button" disabled={working} onClick={() => move(o, 'pause')} className={action}><Pause className="w-3.5 h-3.5" aria-hidden /> Pause</button>}
                  {o.state === 'paused' && <button type="button" disabled={working} onClick={() => move(o, 'resume')} className={action}><Play className="w-3.5 h-3.5" aria-hidden /> Resume</button>}
                  <button type="button" disabled={working} onClick={() => showClaims(o)} className={action} aria-label={`Who claimed ${o.name}`}><Users className="w-3.5 h-3.5" aria-hidden /> Claims</button>
                  {o.status !== 'ENDED' && <button type="button" disabled={working} onClick={() => setEditing({ id: o.id, draft: draftOf(o), claimed: o.redeemedCount })} className={action} aria-label={`Edit ${o.name}`}><Pencil className="w-3.5 h-3.5" aria-hidden /> Edit</button>}
                  {o.status !== 'ENDED' && o.state !== 'finished' && (o.status !== 'DRAFT' || o.redeemedCount > 0) && <button type="button" disabled={working} onClick={() => move(o, 'end')} className={`${action} !text-red-700 dark:!text-red-400`}><Square className="w-3.5 h-3.5" aria-hidden /> End</button>}
                  {o.status === 'DRAFT' && o.redeemedCount === 0 && <button type="button" disabled={working} onClick={() => remove(o)} className={`${action} !text-red-700 dark:!text-red-400`} aria-label={`Delete ${o.name}`}><Trash2 className="w-3.5 h-3.5" aria-hidden /> Delete</button>}
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {o.redeemedCount.toLocaleString('en-IN')}{o.maxRedemptions ? ` of ${o.maxRedemptions.toLocaleString('en-IN')}` : ''} claimed
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">{o.placesLeft == null ? 'No limit' : `${o.placesLeft.toLocaleString('en-IN')} left`}</span>
                </div>
                {pct != null && (
                  <div className="mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${o.name}: share of places claimed`}>
                    <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {picking && (
        <Sheet title="New offer" onClose={() => setPicking(false)}>
          <p className="text-sm text-gray-700 dark:text-gray-300">Start from a ready-made offer and change anything, or build your own. Nothing runs until you press Start.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {OFFER_TEMPLATES.map((tpl) => (
              <li key={tpl.key}>
                <button type="button" onClick={() => { setPicking(false); setEditing({ id: null, draft: fromTemplate(tpl), claimed: 0 }); }}
                  className="w-full h-full text-left rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:border-gray-900 dark:hover:border-white transition-colors">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{PORTAL_LABEL[tpl.portal]}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{TRIGGER_LABEL[tpl.trigger]}</span>
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-gray-900 dark:text-white">{tpl.title}</span>
                  <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">{tpl.about}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setPicking(false); setEditing({ id: null, draft: blank(), claimed: 0 }); }} className="btn-outline text-sm gap-2 mt-4"><Sparkles className="w-4 h-4" aria-hidden /> Build my own</button>
        </Sheet>
      )}

      {editing && <OfferForm key={editing.id ?? 'new'} planPrices={planPrices} id={editing.id} initial={editing.draft} claimed={editing.claimed} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}

      {claims && (
        <Sheet title={`Who claimed “${claims.offer.name}”`} onClose={() => setClaims(null)}>
          {claims.rows == null ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" /> : claims.rows.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Nobody has {isDiscount(claims.offer.benefit) ? 'used this code' : 'claimed this offer'} yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-left text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                  <th scope="col" className="py-2 pr-3 font-medium">Company</th><th scope="col" className="py-2 pr-3 font-medium">{isDiscount(claims.offer.benefit) ? 'Used' : 'Claimed'}</th><th scope="col" className="py-2 font-medium">{isDiscount(claims.offer.benefit) ? 'Discount given' : 'Free until'}</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {claims.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3"><p className="font-medium text-gray-900 dark:text-white">{r.accountName}</p><p className="text-xs text-gray-600 dark:text-gray-400">{r.accountEmail}</p></td>
                      <td className="py-2 pr-3 whitespace-nowrap">{day(r.createdAt)}</td>
                      <td className="py-2 whitespace-nowrap">
                        {isDiscount(claims.offer.benefit)
                          ? <>₹{Math.round((r.discountPaise ?? 0) / 100).toLocaleString('en-IN')} {r.status === 'PENDING' && <span className="ml-1 text-xs font-semibold text-amber-800 dark:text-amber-300">at checkout, not paid yet</span>}</>
                          : day(r.endsAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div className={`${card} mx-auto w-full max-w-2xl p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="portal-section-title">{title}</h2>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OfferForm({ id, initial, claimed, planPrices, onClose, onSaved }: { id: string | null; initial: Draft; claimed: number; planPrices: Record<string, number>; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [bad, setBad] = useState<{ field: OfferField; error: string } | null>(null);
  const locked = claimed > 0; // what claimants were promised can't change
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((p) => ({ ...p, [k]: v })); if (bad?.field === k) setBad(null); };
  const days = Number(d.benefitDays);
  const discount = isDiscount(d.benefit);
  const phraseOf = () => benefitPhrase({ plan: d.plan, benefitDays: days, portal: d.portal, benefit: d.benefit, percentOff: Number(d.percentOff), amountOffPaise: Number(d.amountOffRupees) * 100, cycle: d.cycle });
  const who = d.audience === 'VERIFIED_STARTUPS' ? 'verified startups' : d.audience === 'VERIFIED_FOUNDERS' ? 'founders of verified startups' : d.portal === 'HOST' ? 'hosts' : 'companies';
  const suggestion = discount ? `${phraseOf()} with your code` : days > 0
    ? d.trigger === 'CODE' ? `${benefitPhrase({ plan: d.plan, benefitDays: days, portal: d.portal })} with your code`
      : `${benefitPhrase({ plan: d.plan, benefitDays: days, portal: d.portal })}${d.maxRedemptions ? ` for the first ${Number(d.maxRedemptions).toLocaleString('en-IN')} ${who}` : ` for ${who}`}`
    : '';
  const audiences = audiencesFor(d.portal, d.trigger);
  const plans = discount ? ['ANY', ...offerPlansFor(d.portal)] : offerPlansFor(d.portal);
  /** Changing the portal, what it gives or how it is claimed changes which plans and audiences make sense: keep the form valid. */
  const reshape = (portal: OfferPortal, triggerWanted: OfferTrigger, benefit: OfferBenefit = d.benefit) => setD((p) => {
    const trigger: OfferTrigger = isDiscount(benefit) ? 'CODE' : triggerWanted; // a discount is always a code
    const a = audiencesFor(portal, trigger);
    const pl = isDiscount(benefit) ? ['ANY', ...offerPlansFor(portal)] : offerPlansFor(portal);
    return { ...p, portal, trigger, benefit, audience: a.includes(p.audience) ? p.audience : a[0], plan: pl.includes(p.plan) ? p.plan : isDiscount(benefit) ? 'ANY' : 'PRO', code: trigger === 'CODE' ? (p.code || suggestOfferCode(portal === 'HOST' ? 'HOST' : 'HIRE')) : '', showPublicly: trigger === 'AUTO' ? p.showPublicly : false };
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await saveOfferAction(id, { ...d, percentOff: Number(d.percentOff), amountOffPaise: Math.round(Number(d.amountOffRupees) * 100), benefitDays: Number(d.benefitDays), startsAt: fromIstInput(d.startsAt), endsAt: fromIstInput(d.endsAt), maxRedemptions: d.maxRedemptions.trim() === '' ? null : Number(d.maxRedemptions) });
    setSaving(false);
    if (!r.success) {
      if (r.field) { setBad({ field: r.field, error: r.error }); document.getElementById(`offer-${r.field}`)?.focus(); }
      notify(r.error, 'error');
      return;
    }
    notify(id ? 'Offer saved.' : 'Offer saved as a draft. Press Start when it is ready.', 'success');
    onSaved();
  };

  const label = 'block text-sm font-medium text-gray-900 dark:text-white';
  const hint = 'mt-1 text-xs text-gray-600 dark:text-gray-400';
  const err = (f: OfferField, help?: string) => (
    <p id={`offer-${f}-hint`} className={bad?.field === f ? 'mt-1 text-xs font-medium text-red-700 dark:text-red-400' : hint}>{bad?.field === f ? bad.error : help}</p>
  );
  const cls = (f: OfferField) => `input-field text-sm mt-1.5 ${bad?.field === f ? '!border-red-500' : ''}`;

  return (
    <Sheet title={id ? 'Edit offer' : 'New offer'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4" noValidate>
        {locked && <p role="status" className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">{claimed.toLocaleString('en-IN')} account{claimed === 1 ? ' has' : 's have'} claimed this offer, so the portal, what it gives, audience, code and start are fixed. You can still change the name, headline, end and limit.</p>}
        <div>
          <label htmlFor="offer-name" className={label}>Name (only you see this)</label>
          <input id="offer-name" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} className={cls('name')} placeholder="Launch offer, December" aria-describedby="offer-name-hint" />
          {err('name')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="offer-portal" className={label}>Portal</label>
            <select id="offer-portal" value={d.portal} disabled={locked} onChange={(e) => reshape(e.target.value as OfferPortal, d.trigger)} className={cls('portal')}>
              {OFFER_PORTALS.map((p) => <option key={p} value={p}>{PORTAL_LABEL[p]}</option>)}
            </select>
            {err('portal')}
          </div>
          <div>
            <label htmlFor="offer-trigger" className={label}>How it is claimed</label>
            <select id="offer-trigger" value={d.trigger} disabled={locked || discount} onChange={(e) => reshape(d.portal, e.target.value as OfferTrigger)} className={cls('trigger')} aria-describedby="offer-trigger-hint">
              {OFFER_TRIGGERS.map((g) => <option key={g} value={g}>{TRIGGER_LABEL[g]}</option>)}
            </select>
            {err('trigger', discount ? 'A discount is always a code, used when paying.' : d.trigger === 'AUTO' ? 'Granted by itself the moment an account qualifies.' : 'The customer types a code on their Plans & billing page.')}
          </div>
        </div>
        <div>
          <label htmlFor="offer-benefit" className={label}>What it gives</label>
          <select id="offer-benefit" value={d.benefit} disabled={locked} onChange={(e) => reshape(d.portal, d.trigger, e.target.value as OfferBenefit)} className={cls('benefit')}>
            {OFFER_BENEFITS.map((b) => <option key={b} value={b}>{BENEFIT_LABEL[b]}</option>)}
          </select>
          {err('benefit', discount ? 'Taken off the price before GST, on one payment per company. The invoice shows the code and the list price.' : 'Nothing is paid and no invoice is issued.')}
        </div>
        {d.trigger === 'CODE' && (
          <div>
            <label htmlFor="offer-code" className={label}>Promo code</label>
            <div className="mt-1.5 flex gap-2">
              <input id="offer-code" value={d.code} disabled={locked} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={20} spellCheck={false} autoComplete="off"
                className={`input-field text-sm font-mono tracking-wider ${bad?.field === 'code' ? '!border-red-500' : ''}`} placeholder="LAUNCH100" aria-describedby="offer-code-hint" />
              <button type="button" disabled={locked} onClick={() => set('code', suggestOfferCode(d.portal === 'HOST' ? 'HOST' : 'HIRE'))} className="btn-outline text-sm shrink-0 disabled:opacity-50">Generate</button>
            </div>
            {err('code', '4 to 20 capitals and digits. A code that is hard to guess is safer than a word.')}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="offer-plan" className={label}>{discount ? 'Works on' : 'Plan given free'}</label>
            <select id="offer-plan" value={d.plan} disabled={locked || plans.length === 1} onChange={(e) => set('plan', e.target.value)} className={cls('plan')}>
              {plans.map((k) => <option key={k} value={k}>{k === 'ANY' ? (d.portal === 'HOST' ? 'Pro' : 'Any paid plan') : `${offerPlanName(k, d.portal)} (normally ₹${((planPrices[`${d.portal}:${k}`] ?? offerPlanPricePaise(k, d.portal)) / 100).toLocaleString('en-IN')} a month)`}</option>)}
            </select>
            {err('plan')}
          </div>
          {!discount && (
            <div>
              <label htmlFor="offer-benefitDays" className={label}>Free for (days)</label>
              <input id="offer-benefitDays" type="number" inputMode="numeric" min={1} max={OFFER_MAX_DAYS} value={d.benefitDays} disabled={locked} onChange={(e) => set('benefitDays', e.target.value)} className={cls('benefitDays')} aria-describedby="offer-benefitDays-hint" />
              {err('benefitDays', '30 is one month, 90 is three months, 365 is a year.')}
            </div>
          )}
          {d.benefit === 'PERCENT_OFF' && (
            <div>
              <label htmlFor="offer-percentOff" className={label}>Percentage off</label>
              <input id="offer-percentOff" type="number" inputMode="numeric" min={1} max={MAX_PERCENT_OFF} value={d.percentOff} disabled={locked} onChange={(e) => set('percentOff', e.target.value)} className={cls('percentOff')} aria-describedby="offer-percentOff-hint" />
              {err('percentOff', `1 to ${MAX_PERCENT_OFF}. For a plan at no cost, use a free-plan offer.`)}
            </div>
          )}
          {d.benefit === 'AMOUNT_OFF' && (
            <div>
              <label htmlFor="offer-amountOffPaise" className={label}>Amount off (₹, before GST)</label>
              <input id="offer-amountOffPaise" type="number" inputMode="numeric" min={1} value={d.amountOffRupees} disabled={locked} onChange={(e) => set('amountOffRupees', e.target.value)} className={cls('amountOffPaise')} aria-describedby="offer-amountOffPaise-hint" />
              {err('amountOffPaise', 'Whole rupees. It must be less than the price it is used on.')}
            </div>
          )}
          {discount && (
            <div>
              <label htmlFor="offer-cycle" className={label}>Billing it works on</label>
              <select id="offer-cycle" value={d.cycle} disabled={locked} onChange={(e) => set('cycle', e.target.value as OfferCycle)} className={cls('cycle')}>
                {OFFER_CYCLES.map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}
              </select>
              {err('cycle')}
            </div>
          )}
        </div>
        <fieldset>
          <legend className={label}>Who gets it</legend>
          <div className="mt-1.5 space-y-2">
            {audiences.map((a) => (
              <label key={a} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${d.audience === a ? 'border-gray-900 dark:border-white' : 'border-gray-200 dark:border-gray-800'} ${locked ? 'opacity-60' : 'cursor-pointer'}`}>
                <input type="radio" name="offer-audience" value={a} checked={d.audience === a} disabled={locked} onChange={() => set('audience', a)} className="mt-1" />
                <span><span className="block text-sm font-medium text-gray-900 dark:text-white">{AUDIENCE_LABEL[a]}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{AUDIENCE_HELP[a]}</span></span>
              </label>
            ))}
          </div>
          {err('audience')}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="offer-startsAt" className={label}>Starts (India time)</label>
            <input id="offer-startsAt" type="datetime-local" value={d.startsAt} disabled={locked} onChange={(e) => set('startsAt', e.target.value)} className={cls('startsAt')} />
            {err('startsAt')}
          </div>
          <div>
            <label htmlFor="offer-endsAt" className={label}>Ends (India time)</label>
            <input id="offer-endsAt" type="datetime-local" value={d.endsAt} onChange={(e) => set('endsAt', e.target.value)} className={cls('endsAt')} />
            {err('endsAt')}
          </div>
        </div>
        <div>
          <label htmlFor="offer-maxRedemptions" className={label}>Limit: how many {d.portal === 'HOST' ? 'hosts' : 'companies'} can claim it</label>
          <input id="offer-maxRedemptions" type="number" inputMode="numeric" min={1} value={d.maxRedemptions} onChange={(e) => set('maxRedemptions', e.target.value)} className={cls('maxRedemptions')} placeholder="No limit" aria-describedby="offer-maxRedemptions-hint" />
          {err('maxRedemptions', `The offer stops by itself at this number. One claim per ${d.portal === 'HOST' ? 'host' : 'company'}. Leave empty for no limit.`)}
        </div>
        <div>
          <label htmlFor="offer-headline" className={label}>Headline customers read</label>
          <input id="offer-headline" value={d.headline} onChange={(e) => set('headline', e.target.value)} maxLength={120} className={cls('headline')} placeholder={suggestion || 'Pro free for 3 months for the first 100 startups'} aria-describedby="offer-headline-hint" />
          {bad?.field === 'headline' ? err('headline') : (
            <p id="offer-headline-hint" className={hint}>
              Used in the welcome email, the portal notification and, for automatic offers, the sign-up page.
              {suggestion && d.headline.trim() !== suggestion && <> <button type="button" onClick={() => set('headline', suggestion)} className="font-semibold text-brand hover:underline">Use “{suggestion}”</button></>}
            </p>
          )}
        </div>
        {d.trigger === 'AUTO' && d.portal === 'EMPLOYER' && (
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={d.showPublicly} onChange={(e) => set('showPublicly', e.target.checked)} className="mt-1" />
            <span><span className="block text-sm font-medium text-gray-900 dark:text-white">Show on the hiring sign-up page</span><span className="block text-xs text-gray-600 dark:text-gray-400">With the places left and the end date. Untick to grant it quietly.</span></span>
          </label>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-brand text-sm gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}{id ? 'Save changes' : 'Save as draft'}</button>
        </div>
      </form>
    </Sheet>
  );
}

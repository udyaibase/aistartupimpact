'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Building2, Check, Loader2, Mail, Pencil, Undo2, User } from 'lucide-react';
import { GST_STATES } from '@/lib/billing/gst-states';
import {
  GSTIN_RE, MAX_CC_EMAILS, formatBillingAddress, gstinChecksumValid, panFromGstin, pinStateMismatch, profileComplete,
  type BillingProfile, type BillingType,
} from '@/lib/billing/details';

const input = 'w-full min-h-[44px] px-3 rounded-[10px] border bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';
const ok = 'border-gray-300 dark:border-gray-700';
const bad = 'border-red-500 dark:border-red-500';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1.5';
const STATES = Object.entries(GST_STATES).sort((a, b) => a[1].localeCompare(b[1]));

const TYPES: { value: BillingType; title: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'GST', title: 'GST-registered business', desc: 'Get a tax invoice with your GSTIN to claim input tax credit.', icon: <Building2 className="w-4 h-4" aria-hidden /> },
  { value: 'BUSINESS', title: 'Business without GST', desc: 'Invoice in your company’s name, without a GSTIN.', icon: <Building2 className="w-4 h-4" aria-hidden /> },
  { value: 'INDIVIDUAL', title: 'Individual', desc: 'Invoice in your own name.', icon: <User className="w-4 h-4" aria-hidden /> },
];

type Lookup =
  | { state: 'idle' | 'loading' | 'notfound' }
  | { state: 'error'; message: string }
  | { state: 'filled'; legalName: string; status: string | null; before: BillingProfile };

export type SaveBilling = (p: BillingProfile) => Promise<{ error?: string; field?: string; warnings?: string[] } | null>;

/**
 * Billing profile ("Bill to") and invoice emails, shared by the employer and host billing pages.
 * Shows a summary once complete; editing validates as you go (GSTIN check digit, PIN code) and the server
 * validates again. Changes only affect future invoices. With `lookupUrl`, a new GSTIN fills in the legal name and
 * registered address from the GST register (the user can still edit or undo).
 */
export default function BillingDetailsForm({ initial, save, lookupUrl }: { initial: BillingProfile; save: SaveBilling; lookupUrl?: string }) {
  const [p, setP] = useState(initial);
  const [savedProfile, setSavedProfile] = useState(initial);
  const [editing, setEditing] = useState(!profileComplete(initial));
  const [ccText, setCcText] = useState(initial.billingCcEmails.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof BillingProfile>(k: K, v: BillingProfile[K]) => { setP((x) => ({ ...x, [k]: v })); setSaved(false); };

  const gstin = (p.billingGstin ?? '').toUpperCase();
  const gstinState = p.billingType === 'GST' && GSTIN_RE.test(gstin) ? gstin.slice(0, 2) : null;
  const gstinHint = p.billingType !== 'GST' || gstin.length < 15 ? null
    : !GSTIN_RE.test(gstin) ? 'Format: 2-digit state code, 10-character PAN, then 3 characters.'
    : !gstinChecksumValid(gstin) ? 'The check digit doesn’t match. Check for a typo.' : null;
  const state = gstinState ?? p.billingState ?? '';
  const pinHint = useMemo(() => (/^[1-9][0-9]{5}$/.test(p.billingPostalCode ?? '') && state && pinStateMismatch(p.billingPostalCode!, state)
    ? `This PIN usually belongs to another state than ${GST_STATES[state]}.` : null), [p.billingPostalCode, state]);
  const err = (f: string) => (error?.field === f ? error.message : null);

  // GST register lookup: once per new, well-formed GSTIN (not the one already saved).
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const looked = useRef(initial.billingGstin ?? '');
  const current = useRef(p);
  current.current = p;
  const lookupReady = !!lookupUrl && p.billingType === 'GST' && GSTIN_RE.test(gstin) && gstinChecksumValid(gstin);
  useEffect(() => {
    if (!lookupReady || looked.current === gstin) return;
    looked.current = gstin;
    const ctrl = new AbortController();
    setLookup({ state: 'loading' });
    fetch(`${lookupUrl}?gstin=${gstin}`, { signal: ctrl.signal })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return setLookup({ state: 'error', message: d.error || 'Couldn’t look that GSTIN up. Fill in the details yourself.' });
        const r = d.record;
        if (!d.enabled || !r) return setLookup({ state: 'idle' });
        if (!r.found) return setLookup({ state: 'notfound' });
        const x = current.current;
        setLookup({ state: 'filled', legalName: r.legalName ?? '', status: r.status, before: x });
        setP({
          ...x,
          billingName: r.legalName ?? x.billingName,
          billingAddressLine1: r.addressLine1 ?? x.billingAddressLine1,
          billingAddressLine2: r.addressLine1 ? r.addressLine2 : x.billingAddressLine2,
          billingCity: r.city ?? x.billingCity,
          billingPostalCode: r.postalCode ?? x.billingPostalCode,
        });
        setSaved(false);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setLookup({ state: 'error', message: 'You seem to be offline. Fill in the details yourself.' }); });
    return () => ctrl.abort();
  }, [gstin, lookupReady, lookupUrl]);
  // Editing the GSTIN again clears the last result, and allows the same GSTIN to be looked up again later.
  useEffect(() => { if (!lookupReady && lookup.state !== 'idle') { setLookup({ state: 'idle' }); looked.current = ''; } }, [lookupReady, lookup.state]);
  const inactive = lookup.state === 'filled' && lookup.status && lookup.status.toLowerCase() !== 'active' ? lookup.status : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const next = { ...p, billingState: state || null, billingGstin: p.billingType === 'GST' ? gstin : null, billingCcEmails: ccText.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean) };
    const r = await save(next);
    setBusy(false);
    if (r?.error) { setError({ message: r.error, field: r.field }); document.getElementById(`bd-${r.field}`)?.focus(); return; }
    setWarnings(r?.warnings ?? []);
    setP(next);
    setSavedProfile(next);
    setSaved(true);
    setEditing(false);
  }

  if (!editing) {
    const s = savedProfile;
    return (
      <div className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2 rounded-[12px] border border-gray-200 dark:border-gray-800 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bill to</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{s.billingName}</p>
            {formatBillingAddress(s).map((l) => <p key={l} className="text-sm text-gray-700 dark:text-gray-300">{l}</p>)}
            {s.billingGstin
              ? <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">GSTIN {s.billingGstin} · PAN {panFromGstin(s.billingGstin)}</p>
              : <p className="mt-1 text-sm text-gray-500">{s.billingType === 'INDIVIDUAL' ? 'Individual' : 'Not GST-registered'}</p>}
            {s.billingPoNumber && <p className="text-sm text-gray-700 dark:text-gray-300">PO / reference: {s.billingPoNumber}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invoices sent to</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-900 dark:text-white"><Mail className="w-4 h-4 text-gray-400" aria-hidden /> {s.billingEmail}</p>
            {s.billingCcEmails.length > 0 && <p className="text-sm text-gray-600 dark:text-gray-400">CC: {s.billingCcEmails.join(', ')}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { setEditing(true); setSaved(false); }} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Pencil className="w-4 h-4" aria-hidden /> Edit billing details
          </button>
          {saved && <span role="status" className="inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-400"><Check className="w-4 h-4" aria-hidden /> Saved. Applies to future invoices.</span>}
        </div>
        {warnings.map((w) => <p key={w} className="flex items-start gap-1.5 text-[13px] text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 mt-px shrink-0" aria-hidden />{w}</p>)}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset>
        <legend className={label}>How should we bill you?</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {TYPES.map((t) => {
            const on = p.billingType === t.value;
            return (
              <label key={t.value} className={`flex gap-2.5 p-3 rounded-[12px] border cursor-pointer ${on ? 'border-[#A50F15] bg-red-50/40 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900'}`}>
                <input type="radio" name="bd-type" id={t.value === 'GST' ? 'bd-billingType' : undefined} checked={on} onChange={() => set('billingType', t.value)} className="mt-1 w-4 h-4 accent-[#A50F15]" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">{t.icon}{t.title}</span>
                  <span className="block text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">{t.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
        {err('billingType') && <p role="alert" className="mt-1.5 text-[13px] text-red-700 dark:text-red-400">{err('billingType')}</p>}
      </fieldset>

      {p.billingType && (
        <>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Bill to</legend>
            {p.billingType === 'GST' && (
              <div className="sm:col-span-2">
                <label htmlFor="bd-billingGstin" className={label}>GSTIN</label>
                <input id="bd-billingGstin" value={gstin} onChange={(e) => set('billingGstin', e.target.value.toUpperCase().replace(/\s/g, ''))} maxLength={15} autoComplete="off" spellCheck={false}
                  className={`${input} ${err('billingGstin') || gstinHint ? bad : ok} uppercase font-mono tracking-wide`} placeholder="29ABCDE1234F1ZW" aria-invalid={!!(err('billingGstin') || gstinHint)} aria-describedby="bd-gstin-help" />
                <p id="bd-gstin-help" className={`mt-1 text-[13px] ${err('billingGstin') || gstinHint ? 'text-red-700 dark:text-red-400' : 'text-gray-500'}`}>
                  {err('billingGstin') ?? gstinHint ?? (gstinState && gstinChecksumValid(gstin) ? `Registered in ${GST_STATES[gstinState]} · PAN ${panFromGstin(gstin)}` : 'Printed on invoices so you can claim input tax credit.')}
                </p>
                {lookup.state === 'loading' && <p role="status" className="mt-1.5 flex items-center gap-1.5 text-[13px] text-gray-600 dark:text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Looking it up on the GST register…</p>}
                {lookup.state === 'filled' && (
                  <div role="status" className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-green-800 dark:text-green-300">
                    <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden /> Filled in from the GST register. Check the address before saving.</span>
                    <button type="button" onClick={() => { setP(lookup.before); setLookup({ state: 'idle' }); }} className="inline-flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-300 hover:underline">
                      <Undo2 className="w-3.5 h-3.5" aria-hidden /> Undo
                    </button>
                  </div>
                )}
                {inactive && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 mt-px shrink-0" aria-hidden />This GSTIN is {inactive.toLowerCase()} on the GST register, so you may not be able to claim input tax credit on our invoices.</p>}
                {lookup.state === 'notfound' && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 mt-px shrink-0" aria-hidden />We couldn’t find this GSTIN on the GST register. Check it for a typo.</p>}
                {lookup.state === 'error' && <p className="mt-1.5 text-[13px] text-gray-600 dark:text-gray-400">{lookup.message}</p>}
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="bd-billingName" className={label}>{p.billingType === 'INDIVIDUAL' ? 'Full name' : p.billingType === 'GST' ? 'Legal name (as registered for GST)' : 'Legal business name'}</label>
              <input id="bd-billingName" value={p.billingName ?? ''} onChange={(e) => set('billingName', e.target.value)} maxLength={120} autoComplete={p.billingType === 'INDIVIDUAL' ? 'name' : 'organization'}
                className={`${input} ${err('billingName') ? bad : ok}`} placeholder={p.billingType === 'INDIVIDUAL' ? 'Priya Sharma' : 'Acme AI Private Limited'} />
              {err('billingName') && <p role="alert" className="mt-1 text-[13px] text-red-700 dark:text-red-400">{err('billingName')}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bd-billingAddressLine1" className={label}>Address</label>
              <input id="bd-billingAddressLine1" value={p.billingAddressLine1 ?? ''} onChange={(e) => set('billingAddressLine1', e.target.value)} maxLength={200} autoComplete="address-line1"
                className={`${input} ${err('billingAddressLine1') ? bad : ok}`} placeholder="Building, street" />
              <label htmlFor="bd-billingAddressLine2" className="sr-only">Address line 2</label>
              <input id="bd-billingAddressLine2" value={p.billingAddressLine2 ?? ''} onChange={(e) => set('billingAddressLine2', e.target.value)} maxLength={200} autoComplete="address-line2"
                className={`${input} ${ok} mt-2`} placeholder="Area, landmark (optional)" />
              {err('billingAddressLine1') && <p role="alert" className="mt-1 text-[13px] text-red-700 dark:text-red-400">{err('billingAddressLine1')}</p>}
            </div>
            <div>
              <label htmlFor="bd-billingCity" className={label}>City</label>
              <input id="bd-billingCity" value={p.billingCity ?? ''} onChange={(e) => set('billingCity', e.target.value)} maxLength={80} autoComplete="address-level2" className={`${input} ${err('billingCity') ? bad : ok}`} />
              {err('billingCity') && <p role="alert" className="mt-1 text-[13px] text-red-700 dark:text-red-400">{err('billingCity')}</p>}
            </div>
            <div>
              <label htmlFor="bd-billingPostalCode" className={label}>PIN code</label>
              <input id="bd-billingPostalCode" value={p.billingPostalCode ?? ''} onChange={(e) => set('billingPostalCode', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="postal-code"
                className={`${input} ${err('billingPostalCode') ? bad : ok}`} placeholder="560001" />
              {(err('billingPostalCode') || pinHint) && <p role={err('billingPostalCode') ? 'alert' : undefined} className={`mt-1 text-[13px] ${err('billingPostalCode') ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-300'}`}>{err('billingPostalCode') ?? pinHint}</p>}
            </div>
            <div>
              <label htmlFor="bd-billingState" className={label}>State</label>
              <select id="bd-billingState" value={state} disabled={!!gstinState} onChange={(e) => set('billingState', e.target.value)} autoComplete="address-level1"
                className={`${input} ${err('billingState') ? bad : ok} disabled:bg-gray-50 dark:disabled:bg-gray-900`}>
                <option value="">Choose a state</option>
                {STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
              <p className="mt-1 text-[13px] text-gray-500">{gstinState ? 'From your GSTIN.' : 'Decides CGST + SGST or IGST on your invoice.'}</p>
              {err('billingState') && <p role="alert" className="text-[13px] text-red-700 dark:text-red-400">{err('billingState')}</p>}
            </div>
            <div>
              <span className={label}>Country</span>
              <p className={`${input} ${ok} flex items-center bg-gray-50 dark:bg-gray-900`}>India</p>
              <p className="mt-1 text-[13px] text-gray-500">Billing from outside India? <a href="mailto:billing@udyaibase.com" className="underline">Contact us</a>.</p>
            </div>
            {p.billingType !== 'INDIVIDUAL' && (
              <div className="sm:col-span-2">
                <label htmlFor="bd-billingPoNumber" className={label}>PO or reference number <span className="font-normal text-gray-500">(optional)</span></label>
                <input id="bd-billingPoNumber" value={p.billingPoNumber ?? ''} onChange={(e) => set('billingPoNumber', e.target.value)} maxLength={60} className={`${input} ${ok}`} placeholder="Printed on your invoices" />
              </div>
            )}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2 pt-5 border-t border-gray-100 dark:border-gray-800">
            <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Invoice emails</legend>
            <div>
              <label htmlFor="bd-billingEmail" className={label}>Send invoices to</label>
              <input id="bd-billingEmail" type="email" value={p.billingEmail ?? ''} onChange={(e) => set('billingEmail', e.target.value)} autoComplete="email" inputMode="email"
                className={`${input} ${err('billingEmail') ? bad : ok}`} placeholder="accounts@company.com" />
              {err('billingEmail') && <p role="alert" className="mt-1 text-[13px] text-red-700 dark:text-red-400">{err('billingEmail')}</p>}
            </div>
            <div>
              <label htmlFor="bd-billingCcEmails" className={label}>CC <span className="font-normal text-gray-500">(up to {MAX_CC_EMAILS}, optional)</span></label>
              <input id="bd-billingCcEmails" value={ccText} onChange={(e) => { setCcText(e.target.value); setSaved(false); }} inputMode="email"
                className={`${input} ${err('billingCcEmails') ? bad : ok}`} placeholder="cfo@company.com, finance@company.com" />
              <p className={`mt-1 text-[13px] ${err('billingCcEmails') ? 'text-red-700 dark:text-red-400' : 'text-gray-500'}`}>{err('billingCcEmails') ?? 'Your finance team or accountant. Separate with commas.'}</p>
            </div>
          </fieldset>
        </>
      )}

      {error && !error.field && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !p.billingType} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save billing details
        </button>
        {profileComplete(savedProfile) && (
          <button type="button" onClick={() => { setP(savedProfile); setCcText(savedProfile.billingCcEmails.join(', ')); setError(null); setEditing(false); }} className="min-h-[44px] px-3 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:underline">Cancel</button>
        )}
        <span className="text-[13px] text-gray-500">Changes apply to future invoices. Need a past invoice corrected? <a href="mailto:billing@udyaibase.com" className="underline">Contact us</a>.</span>
      </div>
    </form>
  );
}

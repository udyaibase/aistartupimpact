'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, FileSpreadsheet, FileText, Loader2, Lock, Mail, Search } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { payWithRazorpay } from '@/lib/billing/checkout-client';
import { GST_STATES } from '@/lib/billing/gst-states';
import { GSTIN_RE, gstinChecksumValid, panFromGstin } from '@/lib/billing/details';
import {
  DEFAULT_FILTERS, PACKS, PERIOD_LABELS, PERIODS, SHEET_LABELS, SHEETS, rupees, suggestedPack,
  type FundingFilters, type PackKey, type Period, type SheetKey,
} from '@/lib/funding/packs';

/**
 * Funding downloads on /funding. Both need a verified email (6-digit code) and the required consent box:
 * - Free Snapshot: a summary PDF without the latest rounds.
 * - Paid datasets: Excel, sized in startups, with the buyer's filters; paid through Razorpay.
 * A verified email is remembered for 30 minutes in this tab, so going from free to paid asks only once.
 */

interface PackRow { key: PackKey; name: string; gets: number; available: boolean; note: string | null; totalPaise: number; blurb: string }
interface Facet { value: string; n: number; label?: string }
interface Preview { matched: number; directoryTotal: number; packs: PackRow[]; sample: string[]; facets?: { sectors: Facet[]; stages: Facet[]; cities: Facet[]; total: number; funded: number } }

const PASS_KEY = 'udy-funding-pass';
const PASS_MS = 29 * 60_000;

function storedPass(): { pass: string; email: string } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PASS_KEY) || 'null');
    return v && v.until > Date.now() ? { pass: v.pass, email: v.email } : null;
  } catch { return null; }
}
function storePass(pass: string, email: string) {
  try { sessionStorage.setItem(PASS_KEY, JSON.stringify({ pass, email, until: Date.now() + PASS_MS })); } catch { /* private mode: ask again next time */ }
}
function clearPass() { try { sessionStorage.removeItem(PASS_KEY); } catch { /* ignore */ } }

async function post<T = any>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

const startDownload = (url: string) => { window.location.href = url; };

// ── Email code step (shared) ────────────────────────────────────────────────

function EmailStep({ onVerified }: { onVerified: (pass: string, email: string) => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setBusy(true); setError('');
    const r = await post('/api/funding-data/send-code', { email });
    setBusy(false);
    if (!r.ok) return setError(r.data.error || 'Couldn’t send the code.');
    setSent(true); setCooldown(r.data.cooldown ?? 60);
    setTimeout(() => codeRef.current?.focus(), 50);
  };
  const verify = async () => {
    setBusy(true); setError('');
    const r = await post('/api/funding-data/verify-code', { email, code });
    setBusy(false);
    if (!r.ok) return setError(r.data.error || 'Incorrect code.');
    storePass(r.data.pass, r.data.email);
    onVerified(r.data.pass, r.data.email);
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (sent) verify(); else send(); }}
      className="space-y-3"
    >
      <label className="block">
        <span className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Work or personal email</span>
        <input
          type="email" required autoComplete="email" value={email} disabled={sent}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
          className="input-field w-full text-base disabled:opacity-70"
        />
      </label>
      {sent && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We sent a 6-digit code to <strong className="text-navy dark:text-white">{email}</strong>.{' '}
            <button type="button" className="text-brand font-semibold hover:underline" onClick={() => { setSent(false); setCode(''); setError(''); }}>Change</button>
          </p>
          <input
            ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code"
            aria-label="Verification code"
            className="input-field w-full text-center text-xl tracking-[0.4em] font-semibold"
          />
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy || (sent && code.length !== 6)} className="btn-brand w-full justify-center gap-2 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        {sent ? 'Verify email' : 'Send code'}
      </button>
      {sent && (
        <button type="button" disabled={cooldown > 0 || busy} onClick={send} className="w-full text-sm text-gray-500 hover:text-brand disabled:hover:text-gray-500 disabled:opacity-60">
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      )}
    </form>
  );
}

function Verified({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm">
      <Check className="w-4 h-4 text-green-600 shrink-0" />
      <span className="text-gray-700 dark:text-gray-300 min-w-0 truncate">Verified: <strong>{email}</strong></span>
      <button type="button" onClick={onChange} className="ml-auto text-brand font-semibold hover:underline shrink-0">Change</button>
    </div>
  );
}

function Consent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand shrink-0" />
      <span className="text-sm text-gray-600 dark:text-gray-400">
        I agree to the <a href="/terms" target="_blank" className="text-brand hover:underline">Terms</a> and{' '}
        <a href="/privacy" target="_blank" className="text-brand hover:underline">Privacy Policy</a> and to receive the Udyaibase newsletter. I can unsubscribe at any time.
      </span>
    </label>
  );
}

// ── Multi-select with search (sectors, stages, cities) ──────────────────────

function MultiPick({ label, options, value, onChange }: { label: string; options: Facet[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => options.filter((o) => (o.label ?? o.value).toLowerCase().includes(q.toLowerCase())).slice(0, 80), [options, q]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2.5 text-left" aria-expanded={open}>
        <span className="text-sm font-semibold text-navy dark:text-white">{label}</span>
        <span className="text-xs text-gray-500">{value.length ? `${value.length} selected` : 'All'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-2">
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} className="input-field w-full pl-8 py-2 text-base sm:text-sm" />
          </div>
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {shown.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm">
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="rounded border-gray-300 text-brand focus:ring-brand" />
                <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">{o.label ?? o.value}</span>
                <span className="text-xs text-gray-400">{o.n}</span>
              </label>
            ))}
            {!shown.length && <p className="px-2 py-2 text-sm text-gray-500">No matches</p>}
          </div>
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-2 text-xs text-brand font-semibold hover:underline">Clear</button>}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

/** This browser's last invoice details for funding data (prefill only). */
const BILL_TO_KEY = 'udyaibase:funding-bill-to';

export default function FundingDownloads() {
  const [mode, setMode] = useState<null | 'free' | 'paid'>(null);
  const [verified, setVerified] = useState<{ pass: string; email: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState<{ url: string; kind: 'free' | 'paid' } | null>(null);

  // Paid flow
  const [step, setStep] = useState<'choose' | 'checkout'>('choose');
  const [filters, setFilters] = useState<FundingFilters>(DEFAULT_FILTERS);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [facets, setFacets] = useState<Preview['facets']>();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pack, setPack] = useState<PackKey | null>(null);
  const [billingType, setBillingType] = useState<'INDIVIDUAL' | 'GST'>('INDIVIDUAL');
  const [billingName, setBillingName] = useState('');
  const [billingState, setBillingState] = useState('');
  const [gstin, setGstin] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [pin, setPin] = useState('');
  // Repeat buyers: invoice details are remembered in this browser only (a convenience; never required).
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(BILL_TO_KEY) ?? 'null');
      if (!b || typeof b !== 'object') return;
      if (b.billingType === 'GST' || b.billingType === 'INDIVIDUAL') setBillingType(b.billingType);
      if (typeof b.billingName === 'string') setBillingName(b.billingName);
      if (typeof b.billingState === 'string') setBillingState(b.billingState);
      if (typeof b.billingGstin === 'string') setGstin(b.billingGstin);
      if (typeof b.billingAddressLine1 === 'string') setAddressLine1(b.billingAddressLine1);
      if (typeof b.billingCity === 'string') setCity(b.billingCity);
      if (typeof b.billingPostalCode === 'string') setPin(b.billingPostalCode);
    } catch { /* storage blocked: start empty */ }
  }, []);
  const gstinValid = GSTIN_RE.test(gstin) && gstinChecksumValid(gstin) && !!GST_STATES[gstin.slice(0, 2)];
  const gstinHint = gstin.length < 15 ? 'Printed on your invoice so you can claim input tax credit.'
    : gstinValid ? `Registered in ${GST_STATES[gstin.slice(0, 2)]} · PAN ${panFromGstin(gstin)}`
    : 'That GSTIN doesn’t look right. Check it for a typo.';

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const data = p.get('data');
    if (data) setNotice({
      expired: 'That download link has expired. Buy again to get fresh data, or contact support@udyaibase.com.',
      limit: 'That link has reached its download limit. Contact support@udyaibase.com if you need another copy.',
      refunded: 'That purchase was refunded, so its download link no longer works.',
      invalid: 'That download link isn’t valid. Use the link from your purchase email.',
    }[data] ?? '');
    else if (p.get('report') === 'expired') setNotice('That snapshot link has expired. Verify your email below to get a fresh one.');
    if (window.location.hash === '#funding-data' && !data) setMode('paid');
  }, []);

  const openMode = (m: 'free' | 'paid') => {
    setVerified(storedPass()); setConsent(false); setError(''); setDone(null); setStep('choose'); setMode(m);
  };
  const close = () => { setMode(null); setBusy(false); };
  const passExpired = () => { clearPass(); setVerified(null); setError('Your email check expired. Please verify your email again.'); };

  // Live count while choosing (debounced); facets on first open.
  const filterKey = JSON.stringify(filters);
  const loadPreview = useCallback(async (withFacets: boolean) => {
    setLoadingPreview(true);
    const r = await post<Preview>('/api/funding-data/preview', { filters, facets: withFacets });
    setLoadingPreview(false);
    if (!r.ok) return;
    setPreview(r.data);
    if (r.data.facets) setFacets(r.data.facets);
    setPack((cur) => {
      const rows = r.data.packs;
      if (cur && rows.find((p) => p.key === cur)?.available) return cur;
      return suggestedPack(rows);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  useEffect(() => {
    if (mode !== 'paid' || step !== 'choose') return;
    const t = setTimeout(() => loadPreview(!facets), facets ? 300 : 0);
    return () => clearTimeout(t);
  }, [mode, step, loadPreview, facets]);

  const set = <K extends keyof FundingFilters>(k: K, v: FundingFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const selected = preview?.packs.find((p) => p.key === pack) ?? null;

  const downloadFree = async () => {
    if (!verified) return;
    setBusy(true); setError('');
    const r = await post('/api/funding-report/download', { pass: verified.pass, consent });
    setBusy(false);
    if (r.status === 401) return passExpired();
    if (!r.ok || !r.data.success) return setError(r.data.error || 'Couldn’t prepare the download.');
    setDone({ url: r.data.data.downloadUrl, kind: 'free' });
    startDownload(r.data.data.downloadUrl);
  };

  const pay = async () => {
    if (!verified || !pack) return;
    setBusy(true); setError('');
    const billing = billingType === 'GST'
      ? { billingType, billingName, billingGstin: gstin, billingAddressLine1: addressLine1, billingCity: city, billingPostalCode: pin }
      : { billingType, billingName, billingState };
    try { localStorage.setItem(BILL_TO_KEY, JSON.stringify(billing)); } catch { /* storage blocked */ }
    const r = await post('/api/funding-data/checkout', { pass: verified.pass, consent, pack, filters, billing });
    if (r.status === 401) { setBusy(false); return passExpired(); }
    if (!r.ok) { setBusy(false); return setError(r.data.error || 'Couldn’t start the payment.'); }
    const outcome = await payWithRazorpay(r.data, '/api/funding-data/verify');
    setBusy(false);
    if (!outcome.ok) { if (!outcome.cancelled) setError(outcome.error); return; }
    const url = typeof outcome.data?.downloadUrl === 'string' ? outcome.data.downloadUrl : '';
    setDone({ url, kind: 'paid' });
    if (url) startDownload(url);
  };

  return (
    <section id="funding-data" className="card p-4 sm:p-8 bg-gradient-to-br from-brand-50 via-purple-50 to-pink-50 dark:from-brand-900/20 dark:via-purple-900/20 dark:to-pink-900/20 border-2 border-brand/20 scroll-mt-24">
      <h2 className="font-sora font-extrabold text-lg sm:text-2xl text-navy dark:text-white">AI funding data downloads</h2>
      <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base mt-1">A free summary, or the full Excel dataset with the latest rounds and the filters you choose.</p>
      {notice && <p role="status" className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm px-3 py-2">{notice}</p>}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 mt-4">
        <div className="rounded-2xl bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1"><FileText className="w-5 h-5 text-brand" /><h3 className="font-sora font-bold text-navy dark:text-white">Free Snapshot</h3><span className="ml-auto text-sm font-bold text-green-700 dark:text-green-400">Free</span></div>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 mb-4 mt-2">
            <li>• PDF summary: totals and quarterly trend</li>
            <li>• Top 5 sectors, stages, cities and largest rounds</li>
            <li>• Data up to 90 days ago</li>
          </ul>
          <button onClick={() => openMode('free')} className="mt-auto w-full justify-center gap-2 inline-flex items-center px-4 py-2.5 rounded-lg border border-brand text-brand font-semibold hover:bg-brand/5 transition-colors">
            <Download className="w-4 h-4" /> Get free snapshot
          </button>
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-900 border-2 border-brand/40 p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1"><FileSpreadsheet className="w-5 h-5 text-brand" /><h3 className="font-sora font-bold text-navy dark:text-white">Full dataset (Excel)</h3><span className="ml-auto text-sm font-bold text-brand">from {rupees(PACKS.STARTER.totalPaise)}</span></div>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 mb-4 mt-2">
            <li>• <strong className="text-navy dark:text-white">Includes the latest funding rounds</strong></li>
            <li>• Every startup and round, with investors</li>
            <li>• Choose period, sector, stage, city and currency</li>
          </ul>
          <button onClick={() => openMode('paid')} className="btn-brand mt-auto w-full justify-center gap-2">
            <Lock className="w-4 h-4" /> Choose your data
          </button>
        </div>
      </div>

      <Modal open={mode !== null} onClose={close} maxWidth={mode === 'paid' && step === 'choose' && !done ? '2xl' : 'md'}
        title={done ? 'Your download is ready' : mode === 'free' ? 'Free Funding Snapshot' : step === 'choose' ? 'Choose your data' : 'Verify and pay'}>
        <div className="p-5 sm:p-6 space-y-4">
          {done ? (
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto"><Check className="w-6 h-6 text-green-600" /></div>
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                {done.kind === 'free'
                  ? 'Your snapshot is downloading. We’ve also emailed you the link (valid 7 days).'
                  : done.url ? 'Payment received. Your Excel file is downloading. The link and your GST invoice are on their way to your inbox.' : 'Payment received. Your download link and GST invoice will arrive by email within a few minutes.'}
              </p>
              {done.url && <button onClick={() => startDownload(done.url)} className="btn-brand w-full justify-center gap-2"><Download className="w-4 h-4" /> Download again</button>}
              {done.kind === 'free' && (
                <button onClick={() => { setDone(null); setConsent(false); setStep('choose'); setMode('paid'); }} className="w-full text-sm text-brand font-semibold hover:underline">
                  Need the latest rounds? See the full dataset →
                </button>
              )}
            </div>
          ) : mode === 'free' ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">Verify your email to download. We’ll also email you the link.</p>
              {verified ? <Verified email={verified.email} onChange={() => { clearPass(); setVerified(null); }} /> : <EmailStep onVerified={(pass, email) => setVerified({ pass, email })} />}
              {verified && (
                <>
                  <Consent checked={consent} onChange={setConsent} />
                  {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                  <button onClick={downloadFree} disabled={!consent || busy} className="btn-brand w-full justify-center gap-2 disabled:opacity-60">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download free PDF
                  </button>
                </>
              )}
            </>
          ) : step === 'choose' ? (
            <>
              <div>
                <p className="text-sm font-semibold text-navy dark:text-white mb-2">Period</p>
                <div className="flex flex-wrap gap-2">
                  {PERIODS.map((p) => (
                    <button key={p} type="button" onClick={() => set('period', p as Period)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filters.period === p ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand'}`}>
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
                {filters.period === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="text-xs text-gray-500">From<input type="date" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value || null)} className="input-field w-full text-base mt-1" /></label>
                    <label className="text-xs text-gray-500">To<input type="date" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value || null)} className="input-field w-full text-base mt-1" /></label>
                  </div>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <MultiPick label="Sectors" options={facets?.sectors ?? []} value={filters.sectors} onChange={(v) => set('sectors', v)} />
                <MultiPick label="Stages" options={facets?.stages ?? []} value={filters.stages} onChange={(v) => set('stages', v)} />
                <MultiPick label="Cities" options={facets?.cities ?? []} value={filters.cities} onChange={(v) => set('cities', v)} />
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={filters.fundedOnly} onChange={(e) => set('fundedOnly', e.target.checked)} className="rounded border-gray-300 text-brand focus:ring-brand" />
                  Only startups with recorded funding
                </label>
                <div className="flex items-center gap-1 text-sm" role="radiogroup" aria-label="Currency">
                  <span className="text-gray-500 mr-1">Currency</span>
                  {(['INR', 'USD'] as const).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={filters.currency === c} onClick={() => set('currency', c)}
                      className={`px-2.5 py-1 rounded-md border ${filters.currency === c ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand'}`}>
                      {c === 'INR' ? '₹ INR' : '$ USD'}
                    </button>
                  ))}
                </div>
              </div>

              <details className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                <summary className="text-sm font-semibold text-navy dark:text-white cursor-pointer">Sheets in the file ({2 + filters.sheets.length})</summary>
                <div className="grid grid-cols-2 gap-1.5 mt-2 text-sm">
                  <span className="flex items-center gap-2 text-gray-500"><Check className="w-4 h-4" /> Startups</span>
                  <span className="flex items-center gap-2 text-gray-500"><Check className="w-4 h-4" /> Funding rounds</span>
                  {SHEETS.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={filters.sheets.includes(s)} className="rounded border-gray-300 text-brand focus:ring-brand"
                        onChange={(e) => set('sheets', e.target.checked ? [...filters.sheets, s] : filters.sheets.filter((x) => x !== s) as SheetKey[])} />
                      {SHEET_LABELS[s]}
                    </label>
                  ))}
                </div>
              </details>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5 text-sm" aria-live="polite">
                {preview ? (
                  <>
                    <span className="font-semibold text-navy dark:text-white">{preview.matched.toLocaleString('en-IN')} startups match</span>
                    <span className="text-gray-500"> of {preview.directoryTotal.toLocaleString('en-IN')} in the directory</span>
                    {loadingPreview && <Loader2 className="inline w-3.5 h-3.5 ml-2 animate-spin text-gray-400" />}
                    {preview.sample.length > 0 && <p className="text-xs text-gray-500 mt-0.5 truncate">Top: {preview.sample.join(', ')}…</p>}
                  </>
                ) : <span className="text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Counting startups…</span>}
              </div>

              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pack">
                {(preview?.packs ?? []).map((p) => (
                  <button key={p.key} type="button" role="radio" aria-checked={pack === p.key} disabled={!p.available} onClick={() => setPack(p.key)}
                    className={`text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${pack === p.key ? 'border-brand bg-brand/5' : 'border-gray-200 dark:border-gray-700 hover:border-brand/50'} disabled:opacity-50 disabled:hover:border-gray-200 disabled:cursor-not-allowed ${p.key === 'FULL' ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-sora font-bold text-navy dark:text-white">{p.name}</span>
                      <span className="font-bold text-navy dark:text-white">{rupees(p.totalPaise)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.note ?? (p.key === 'FULL'
                        ? `All ${p.gets.toLocaleString('en-IN')} startups, every field, all sheets. Fresh data for 12 months.`
                        : p.gets < (PACKS[p.key].limit ?? 0) ? `Up to ${PACKS[p.key].limit!.toLocaleString('en-IN')} startups: you get all ${p.gets.toLocaleString('en-IN')} matches` : `Top ${p.gets.toLocaleString('en-IN')} of your matches`)}
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">Prices include 18% GST. A GST invoice is emailed after payment.</p>
              <button onClick={() => { setError(''); setStep('checkout'); }} disabled={!selected?.available} className="btn-brand w-full justify-center disabled:opacity-60">
                Continue{selected ? ` with ${selected.name} · ${rupees(selected.totalPaise)}` : ''}
              </button>
            </>
          ) : (
            <>
              {selected && (
                <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5 text-sm">
                  <span><strong className="text-navy dark:text-white">{selected.name}</strong> · {selected.gets.toLocaleString('en-IN')} startups · {filters.currency}</span>
                  <button type="button" onClick={() => setStep('choose')} className="text-brand font-semibold hover:underline">Edit</button>
                </div>
              )}
              {verified ? <Verified email={verified.email} onChange={() => { clearPass(); setVerified(null); }} /> : <EmailStep onVerified={(pass, email) => setVerified({ pass, email })} />}
              {verified && (
                <form onSubmit={(e) => { e.preventDefault(); pay(); }} className="space-y-3">
                  <div className="flex gap-2" role="radiogroup" aria-label="Invoice type">
                    {([['INDIVIDUAL', 'Individual'], ['GST', 'Business with GSTIN']] as const).map(([v, l]) => (
                      <button key={v} type="button" role="radio" aria-checked={billingType === v} onClick={() => setBillingType(v)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm ${billingType === v ? 'border-brand bg-brand/5 text-brand font-semibold' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>{l}</button>
                    ))}
                  </div>
                  <input required value={billingName} onChange={(e) => setBillingName(e.target.value)} autoComplete={billingType === 'GST' ? 'organization' : 'name'}
                    placeholder={billingType === 'GST' ? 'Legal business name' : 'Full name'} aria-label="Name on invoice" className="input-field w-full text-base" />
                  {billingType === 'GST' ? (
                    <>
                      <div>
                        <input required value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15))} placeholder="GSTIN, e.g. 29ABCDE1234F1Z5" aria-label="GSTIN"
                          aria-invalid={gstin.length === 15 && !gstinValid} aria-describedby="fd-gstin-hint" autoComplete="off" spellCheck={false}
                          className={`input-field w-full text-base uppercase font-mono tracking-wide ${gstin.length === 15 && !gstinValid ? 'border-red-500' : ''}`} />
                        <p id="fd-gstin-hint" className={`mt-1 text-xs ${gstin.length === 15 && !gstinValid ? 'text-red-600 dark:text-red-400' : gstinValid ? 'text-green-700 dark:text-green-400' : 'text-gray-500'}`}>{gstinHint}</p>
                      </div>
                      <input required value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={200} autoComplete="street-address" placeholder="Registered address (building, street, area)" aria-label="Registered address" className="input-field w-full text-base" />
                      <div className="grid grid-cols-2 gap-2">
                        <input required value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" placeholder="City" aria-label="City" className="input-field w-full text-base" />
                        <input required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="postal-code" placeholder="PIN code" aria-label="PIN code" className="input-field w-full text-base" />
                      </div>
                    </>
                  ) : (
                    <select required value={billingState} onChange={(e) => setBillingState(e.target.value)} aria-label="State" className="input-field w-full text-base">
                      <option value="">Your state</option>
                      {Object.entries(GST_STATES).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                    </select>
                  )}
                  <Consent checked={consent} onChange={setConsent} />
                  {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                  <button type="submit" disabled={!consent || busy || !selected || (billingType === 'GST' && !gstinValid)} className="btn-brand w-full justify-center gap-2 disabled:opacity-60">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Pay {selected ? rupees(selected.totalPaise) : ''}
                  </button>
                  <p className="text-xs text-gray-500 text-center">Secure payment by Razorpay. For your own or internal use; please don’t share or resell the file.</p>
                </form>
              )}
              {!verified && error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Maximize2, Save, X } from 'lucide-react';
import { notify } from '@/components/Toast';
import { ask } from '@/components/Ask';
import { card } from '@/components/billing/parts';
import InvoiceLivePreview from '@/components/billing/InvoiceLivePreview';
import { previewInvoiceAction, saveInvoiceSettingsAction, type InvoiceSettingsView } from '@/app/(dashboard)/billing/invoice-settings/actions';
import { FOOTER_NOTE_MAX, INVOICE_PRODUCTS, type InvoiceField, type InvoiceProduct, type InvoiceSettings } from '@/lib/billing/invoice-settings';

const label = 'block text-sm font-medium text-gray-900 dark:text-white';
const hint = 'mt-1 text-xs text-gray-600 dark:text-gray-400';

/**
 * Seller details, SAC codes and the footer note printed on GST invoices. An empty field uses the server setting
 * shown under it. The sample invoice beside the form redraws as you type; "Open exact PDF" builds the real file
 * from what is typed, before anything is saved.
 */
export default function InvoiceSettingsForm({ view }: { view: InvoiceSettingsView }) {
  const router = useRouter();
  const [form, setForm] = useState<InvoiceSettings>(view.saved);
  const [product, setProduct] = useState<InvoiceProduct>('employer');
  const [busy, setBusy] = useState<null | 'preview' | 'save'>(null);
  const [bad, setBad] = useState<{ field: InvoiceField; error: string } | null>(null);
  const [large, setLarge] = useState(false);
  const closeLarge = useRef<HTMLButtonElement>(null);

  // The enlarged preview: Escape closes it, and focus starts on its Close button.
  useEffect(() => {
    if (!large) return;
    closeLarge.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLarge(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [large]);

  const set = (f: InvoiceField, v: string) => { setForm((p) => ({ ...p, [f]: v })); if (bad?.field === f) setBad(null); };
  const dirty = JSON.stringify(clean(form)) !== JSON.stringify(clean(view.saved));

  const fail = (r: { error: string; field?: InvoiceField }) => {
    if (r.field) { setBad({ field: r.field, error: r.error }); document.getElementById(`inv-${r.field}`)?.focus(); }
    notify(r.error, 'error');
  };

  const preview = async () => {
    setBusy('preview');
    // Opened before the wait so the browser treats it as the click's own window, not a pop-up.
    const tab = window.open('', '_blank');
    const r = await previewInvoiceAction(form, product);
    setBusy(null);
    if (!r.success) { tab?.close(); fail(r); return; }
    const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (tab) tab.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = 'sample-invoice.pdf'; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // A different GSTIN is a different tax registration: worth one deliberate confirmation before it goes on invoices.
    const effective = (s: InvoiceSettings) => ((s.gstin ?? '').trim().toUpperCase() || view.fallback?.gstin || '');
    const was = effective(view.saved);
    const next = effective(form);
    if (was && next && was !== next) {
      const ok = await ask({
        title: 'Change the GSTIN on new invoices?',
        message: `New invoices and credit notes will be issued under ${next} instead of ${was}. Invoices already issued keep ${was}. The invoice number series carries on, so do this only at the point your CA tells you to switch registration.`,
        confirmLabel: 'Change GSTIN', danger: true,
      });
      if (!ok) return;
    }
    setBusy('save');
    const r = await saveInvoiceSettingsAction(form);
    setBusy(null);
    if (!r.success) { fail(r); return; }
    notify(r.protectedInvoices > 0
      ? `Saved. New invoices use these details; ${r.protectedInvoices.toLocaleString('en-IN')} invoice${r.protectedInvoices === 1 ? '' : 's'} already issued keep the old ones.`
      : 'Saved. New invoices use these details.', 'success');
    router.refresh();
  };

  const field = (f: InvoiceField, text: string, opts: { help?: string; placeholder?: string; mono?: boolean; maxLength?: number } = {}) => {
    const fallback = view.fallback?.[f];
    const err = bad?.field === f ? bad.error : null;
    return (
      <div>
        <label htmlFor={`inv-${f}`} className={label}>{text}</label>
        <input id={`inv-${f}`} type={f === 'email' ? 'email' : 'text'} value={form[f] ?? ''} onChange={(e) => set(f, e.target.value)}
          maxLength={opts.maxLength} placeholder={opts.placeholder} autoComplete="off" spellCheck={false}
          aria-invalid={err ? true : undefined} aria-describedby={`inv-${f}-hint`}
          className={`input-field text-sm mt-1.5 ${opts.mono ? 'font-mono tracking-wide' : ''} ${err ? '!border-red-500' : ''}`} />
        <p id={`inv-${f}-hint`} className={err ? 'mt-1 text-xs font-medium text-red-700 dark:text-red-400' : hint}>
          {err ?? (<>{opts.help}{opts.help && fallback ? ' ' : ''}{fallback ? <>Empty uses the server setting: <span className="font-medium text-gray-900 dark:text-gray-200">{fallback}</span>.</> : null}</>)}
        </p>
      </div>
    );
  };

  return (
    <form onSubmit={save} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)] xl:items-start" noValidate>
      <div className="space-y-5 min-w-0">
      {view.enabled === false && (
        <p role="status" className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Invoices are off: customers are not getting a tax invoice yet. Add the seller name, GSTIN, address and a default SAC code, then save.
        </p>
      )}
      {view.enabled === null && (
        <p role="status" className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          The preview and the server settings are unavailable right now. {view.linkProblem} Saving still works when no invoice has been issued yet.
        </p>
      )}

      <section className={`${card} p-5`} aria-labelledby="inv-seller">
        <h2 id="inv-seller" className="portal-section-title">Seller details</h2>
        <p className={hint}>Printed under “From” on every tax invoice and credit note.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {field('sellerName', 'Legal name', { help: 'The registered company name.', maxLength: 120 })}
          {field('gstin', 'GSTIN', { help: 'The first two digits decide whether CGST and SGST or IGST is charged.', mono: true, maxLength: 15, placeholder: '29ABCDE1234F1Z5' })}
          <div className="md:col-span-2">{field('address', 'Registered address', { help: 'One line, as on the GST certificate.', maxLength: 300 })}</div>
          {field('email', 'Billing email', { help: 'Shown on the invoice; customer replies to invoice emails go here.', maxLength: 120 })}
          {field('phone', 'Phone', { help: 'A company prints its phone number on its bills.', maxLength: 20, placeholder: '+91 98765 43210' })}
          {field('website', 'Website', { help: 'Printed as a plain address.', maxLength: 80, placeholder: 'udyaibase.com' })}
          {field('cin', 'CIN', { help: 'Required on the bills of a company (Private Limited or Limited). Leave empty for a proprietorship or partnership.', mono: true, maxLength: 21, placeholder: 'U72900KA2024PTC123456' })}
        </div>
        <p className={`${hint} mt-4`}>
          Invoice numbers start with <span className="font-mono font-medium text-gray-900 dark:text-gray-200">{view.fallback?.prefix ?? 'UTPL'}</span> and
          run in order through each financial year, like <span className="font-mono">{view.fallback?.prefix ?? 'UTPL'}/26-27/0001</span>; credit notes run in their own series. The prefix is a server setting and can’t be changed here, because changing it mid-year breaks the series.
        </p>
      </section>

      <section className={`${card} p-5`} aria-labelledby="inv-sac">
        <h2 id="inv-sac" className="portal-section-title">SAC / HSN codes</h2>
        <p className={hint}>The code your CA gives for each kind of sale: 4, 6 or 8 digits. It is printed on the invoice line.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {field('sac', 'Default code', { help: 'Used wherever a product below has none of its own.', mono: true, maxLength: 8, placeholder: '998314' })}
          <div className="hidden md:block" aria-hidden />
          {INVOICE_PRODUCTS.map((p) => (
            <div key={p.key}>{field(p.field, p.label, { help: 'Leave empty to use the default code.', mono: true, maxLength: 8 })}</div>
          ))}
        </div>
      </section>

      <section className={`${card} p-5`} aria-labelledby="inv-note">
        <h2 id="inv-note" className="portal-section-title">Footer note</h2>
        <label htmlFor="inv-footerNote" className={`${label} mt-3`}>Note printed above the footer (optional)</label>
        <textarea id="inv-footerNote" rows={2} maxLength={FOOTER_NOTE_MAX} value={form.footerNote ?? ''} onChange={(e) => set('footerNote', e.target.value)}
          aria-invalid={bad?.field === 'footerNote' ? true : undefined} aria-describedby="inv-footerNote-hint"
          className={`input-field text-sm mt-1.5 ${bad?.field === 'footerNote' ? '!border-red-500' : ''}`} />
        <p id="inv-footerNote-hint" className={bad?.field === 'footerNote' ? 'mt-1 text-xs font-medium text-red-700 dark:text-red-400' : hint}>
          {bad?.field === 'footerNote' ? bad.error : `For a line your CA asks for, such as a jurisdiction or MSME registration. ${(form.footerNote ?? '').length}/${FOOTER_NOTE_MAX} characters. The rest of the layout is fixed so no required field can be removed.`}
        </p>
      </section>

        <div className={`${card} p-4 flex flex-wrap items-center gap-3`}>
          <span className="text-xs text-gray-600 dark:text-gray-400">Nothing changes for customers until you save. Invoices already issued never change.</span>
          <button type="submit" disabled={busy !== null || !dirty} className="btn-brand text-sm gap-2 ml-auto disabled:opacity-50">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
            {busy === 'save' ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      <aside className={`${card} p-4 xl:sticky xl:top-4 min-w-0`} aria-labelledby="inv-live">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="inv-live" className="portal-section-title">Live preview</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-600" aria-hidden /> Updates as you type</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="inv-product" className="text-xs font-medium text-gray-700 dark:text-gray-300">Sample for</label>
          <select id="inv-product" value={product} onChange={(e) => setProduct(e.target.value as InvoiceProduct)} className="input-field text-xs !w-auto !py-1.5 flex-1 min-w-[160px]">
            {INVOICE_PRODUCTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button type="button" onClick={preview} disabled={busy !== null} className="btn-outline text-xs gap-1.5 disabled:opacity-50">
            {busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <FileText className="w-3.5 h-3.5" aria-hidden />}
            {busy === 'preview' ? 'Building…' : 'Open exact PDF'}
          </button>
          <button type="button" onClick={() => setLarge(true)} className="btn-outline text-xs gap-1.5">
            <Maximize2 className="w-3.5 h-3.5" aria-hidden /> Enlarge
          </button>
        </div>
        <div className="mt-3">
          <InvoiceLivePreview draft={form} fallback={view.fallback} product={product} />
        </div>
      </aside>

      {large && (
        <div role="dialog" aria-modal="true" aria-label="Sample invoice, enlarged" className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-8" onClick={() => setLarge(false)}>
          <div className="mx-auto w-full max-w-[860px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Sample invoice, as it stands in the form</p>
              <button ref={closeLarge} type="button" onClick={() => setLarge(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                <X className="w-4 h-4" aria-hidden /> Close
              </button>
            </div>
            <div className="rounded-xl bg-white p-3 dark:bg-gray-900">
              <InvoiceLivePreview draft={form} fallback={view.fallback} product={product} />
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/** Empty and untouched fields compare equal, so Save only lights up for a real change. */
function clean(s: InvoiceSettings): InvoiceSettings {
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v).sort()) as InvoiceSettings;
}

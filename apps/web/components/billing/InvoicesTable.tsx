'use client';

import { useState } from 'react';
import { Check, Download, Loader2, Mail } from 'lucide-react';

export interface InvoiceRow {
  id: string;
  label: string;
  date: string;
  periodStart: string | null;
  periodEnd: string | null;
  amountPaise: number;
  gstPaise: number;
  totalPaise: number;
  status: string;
  refundedPaise: number;
  invoiceNumber: string | null;
  emailedAt: string | null;
  /** Set when a refund produced a GST credit note. */
  creditNoteNumber: string | null;
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function statusOf(r: InvoiceRow): { text: string; tone: string } {
  if (r.status !== 'SUCCESS') return { text: 'Failed', tone: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' };
  if (r.refundedPaise >= r.totalPaise) return { text: 'Refunded', tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  if (r.refundedPaise > 0) return { text: 'Partly refunded', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' };
  return { text: 'Paid', tone: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' };
}

/**
 * Payments and their GST invoices (employer and host billing). Each paid payment has a numbered invoice
 * to download or email again; invoices are emailed automatically after payment.
 */
export default function InvoicesTable({ rows, invoicesOn, apiBase, invoiceEmail }: {
  rows: InvoiceRow[];
  invoicesOn: boolean;
  /** e.g. /api/employer/billing/invoice */
  apiBase: string;
  invoiceEmail: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  async function emailAgain(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch(`${apiBase}/${id}/email`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setNotice(res.ok ? { id, ok: true, text: `Sent to ${d.to}` } : { id, ok: false, text: d.error || 'Couldn’t send. Try again.' });
    } catch {
      setNotice({ id, ok: false, text: 'You seem to be offline.' });
    }
    setBusy(null);
  }

  const invoiceable = (r: InvoiceRow) => invoicesOn && r.status === 'SUCCESS' && r.totalPaise > 0;
  const creditNote = (r: InvoiceRow) => invoicesOn && r.creditNoteNumber ? (
    <a href={`${apiBase}/${r.id}/credit-note`} className="block mt-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:underline" aria-label={`Download credit note ${r.creditNoteNumber}`}>
      Credit note {r.creditNoteNumber}
    </a>
  ) : null;
  const actions = (r: InvoiceRow) => invoiceable(r) ? (
    <div className="flex items-center gap-1">
      <a href={`${apiBase}/${r.id}`} className="inline-flex items-center gap-1 min-h-[36px] px-2 rounded-[8px] text-[13px] font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={`Download invoice${r.invoiceNumber ? ` ${r.invoiceNumber}` : ''}`}>
        <Download className="w-4 h-4" aria-hidden /> PDF
      </a>
      <button type="button" onClick={() => emailAgain(r.id)} disabled={busy === r.id} className="inline-flex items-center gap-1 min-h-[36px] px-2 rounded-[8px] text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50" aria-label="Email this invoice again">
        {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Mail className="w-4 h-4" aria-hidden />} Email
      </button>
    </div>
  ) : <span className="text-gray-400 text-[13px]">—</span>;
  const period = (r: InvoiceRow) => (r.periodStart && r.periodEnd ? `${shortFmt(r.periodStart)} – ${fmt(r.periodEnd)}` : 'One-time');

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
              {['Invoice', 'Date', 'For', 'Amount', 'GST', 'Total', 'Status', ''].map((h, i) => (
                <th key={h || i} scope="col" className={`px-4 sm:px-5 py-2 font-semibold ${['Amount', 'GST', 'Total'].includes(h) ? 'text-right' : ''}`}>{h || <span className="sr-only">Actions</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => {
              const s = statusOf(r);
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-4 sm:px-5 py-3 font-mono text-[12.5px] text-gray-900 dark:text-white whitespace-nowrap">{r.invoiceNumber ?? (invoiceable(r) ? 'Issued on download' : '—')}</td>
                  <td className="px-4 sm:px-5 py-3 whitespace-nowrap">{fmt(r.date)}</td>
                  <td className="px-4 sm:px-5 py-3">{r.label}<span className="block text-xs text-gray-500">{period(r)}</span></td>
                  <td className="px-4 sm:px-5 py-3 text-right tabular-nums">{rupees(r.amountPaise)}</td>
                  <td className="px-4 sm:px-5 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{rupees(r.gstPaise)}</td>
                  <td className="px-4 sm:px-5 py-3 text-right tabular-nums font-semibold">{rupees(r.totalPaise)}</td>
                  <td className="px-4 sm:px-5 py-3"><span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${s.tone}`}>{s.text}</span>{creditNote(r)}</td>
                  <td className="px-4 sm:px-5 py-2">
                    {actions(r)}
                    {notice?.id === r.id && <p role="status" className={`mt-0.5 text-xs ${notice.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{notice.ok && <Check className="inline w-3 h-3 mr-0.5" aria-hidden />}{notice.text}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((r) => {
          const s = statusOf(r);
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.label}</p>
                  <p className="text-xs text-gray-500">{fmt(r.date)} · {period(r)}</p>
                  {r.invoiceNumber && <p className="text-xs font-mono text-gray-600 dark:text-gray-400 mt-0.5">{r.invoiceNumber}</p>}
                  {creditNote(r)}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{rupees(r.totalPaise)}</p>
                  <p className="text-[11px] text-gray-500 tabular-nums">incl. {rupees(r.gstPaise)} GST</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.tone}`}>{s.text}</span>
                {actions(r)}
              </div>
              {notice?.id === r.id && <p role="status" className={`mt-1 text-xs ${notice.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{notice.text}</p>}
            </li>
          );
        })}
      </ul>

      <p className="px-4 sm:px-5 py-3 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800">
        {invoicesOn
          ? <>GST tax invoices are emailed automatically after each payment{invoiceEmail ? <> to <span className="font-semibold">{invoiceEmail}</span></> : ''}. Change where they go in Billing details below.</>
          : <>Razorpay emails a receipt for every payment. GST invoices will appear here shortly. Need one now? Email <a className="underline" href="mailto:billing@udyaibase.com">billing@udyaibase.com</a>.</>}
      </p>
    </div>
  );
}

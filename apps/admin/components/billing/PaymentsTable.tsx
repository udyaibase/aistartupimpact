'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Download, Loader2, RotateCcw } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { notify } from '@/components/Toast';
import { refundPaymentAction } from '@/app/(dashboard)/billing/actions';
import { CYCLE_LABEL, STATE_LABEL, STREAM_LABEL, type LedgerRow, type PaymentState, type Stream } from '@/lib/billing/types';
import { day, rupees } from './format';

type Row = LedgerRow & { recovered?: boolean };

const STATE_STYLE: Record<PaymentState, string> = {
  PAID: 'text-green-700 dark:text-green-400',
  PART_REFUNDED: 'text-gray-700 dark:text-gray-300',
  REFUNDED: 'text-gray-700 dark:text-gray-300',
  FAILED: 'text-amber-700 dark:text-amber-400',
};
const options = <T extends string>(labels: Record<T, string>, only?: T[]) =>
  (Object.entries(labels) as [T, string][]).filter(([v]) => !only || only.includes(v)).map(([value, label]) => ({ value, label }));
const input = 'min-h-[38px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand';

function RefundDialog({ p, onClose, onDone }: { p: Row; onClose: () => void; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState(String(p.totalPaise / 100));
  const [reason, setReason] = useState('');
  const [endAccess, setEndAccess] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const oneTime = p.code === 'BOOST' || p.code === 'CERTIFICATES';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await refundPaymentAction({ source: p.stream as 'EMPLOYER' | 'HOST' | 'FUNDING', id: p.id, amountRupees: Number(amount), reason, endAccess });
    setBusy(false);
    if (!r.success) { setError(r.error ?? 'The refund failed.'); return; }
    onDone(r.online ? `Refund ${r.refundId} started in Razorpay. The customer has been emailed.` : 'Refund recorded. Transfer the money by bank; the customer has been emailed.');
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="refund-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <form onSubmit={submit} className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-xl p-5 shadow-xl space-y-3">
        <div>
          <p id="refund-title" className="text-base font-semibold text-gray-900 dark:text-white">Refund {p.account}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{p.product} · paid {rupees(p.totalPaise)} on {day(p.paidAt)}{p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}</p>
        </div>
        <p className={`text-xs rounded-lg px-3 py-2 ${p.online ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'}`}>
          {p.online ? 'This is refunded through Razorpay straight away. It can’t be undone.' : 'Paid by invoice or UPI: this only records the refund. Send the money back by bank transfer.'}
        </p>
        <div>
          <label htmlFor="rf-amount" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">Amount (₹, including GST)</label>
          <input id="rf-amount" type="number" min={1} step="0.01" max={p.totalPaise / 100} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-full`} />
        </div>
        <div>
          <label htmlFor="rf-reason" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">Reason</label>
          <input id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Charged twice, cancelled within 7 days" className={`${input} w-full`} />
        </div>
        {p.stream === 'FUNDING' ? (
          <p className="text-xs text-gray-600 dark:text-gray-400">Their download link stops working once the refund is recorded.</p>
        ) : (
          <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
            <input type="checkbox" checked={endAccess} onChange={(e) => setEndAccess(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand" />
            {p.code === 'BOOST' ? 'End the Boost on that event now' : p.code === 'CERTIFICATES' ? 'Switch off certificates for that event' : 'End their paid plan now (drops to Free)'}
          </label>
        )}
        <p className="text-xs text-gray-600 dark:text-gray-400">A GST credit note is issued against the original invoice{oneTime ? '' : ' and emailed to the customer'}.</p>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="min-h-[38px] px-4 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-[38px] px-4 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Refund
          </button>
        </div>
      </form>
    </div>
  );
}

const csvCell = (v: string | number | null | undefined) => {
  const s = String(v ?? '');
  // A leading =, +, - or @ would run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function downloadCsv(rows: Row[], name: string) {
  const head = ['Date', 'Stream', 'Account', 'Email', 'Product', 'Billing', 'Amount before GST', 'GST', 'Total paid', 'Net revenue', 'Status', 'Method', 'Invoice', 'Razorpay payment', 'Refunded on', 'Refund amount', 'Refund reason', 'Credit note'];
  const lines = rows.map((r) => [
    (r.paidAt ?? r.createdAt).slice(0, 10), STREAM_LABEL[r.stream], r.account, r.email, r.product, CYCLE_LABEL[r.cycle],
    r.amountPaise / 100, r.gstPaise / 100, r.totalPaise / 100, r.netPaise / 100, STATE_LABEL[r.state], r.online ? 'Razorpay' : 'Invoice or UPI',
    r.invoiceNumber, r.razorpayId, r.refundedAt?.slice(0, 10), r.refundAmountPaise == null ? '' : r.refundAmountPaise / 100, r.refundReason, r.creditNoteNumber,
  ].map(csvCell).join(','));
  const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The payments list used across billing. `view` picks the columns: every payment, only failed ones (with whether
 * the account paid later), or only refunds (with reason, who refunded and the credit note).
 */
export default function PaymentsTable({ rows, tableId, view = 'all', showStream = true, title }: {
  rows: Row[]; tableId: string; view?: 'all' | 'failed' | 'refunds'; showStream?: boolean; title: string;
}) {
  const router = useRouter();
  const [refund, setRefund] = useState<Row | null>(null);

  const columns = useMemo<Column<Row>[]>(() => {
    const date: Column<Row> = view === 'refunds'
      ? { key: 'date', header: 'Refunded', sortValue: (r) => new Date(r.refundedAt!), cell: (r) => <span className="whitespace-nowrap">{day(r.refundedAt)}</span> }
      : view === 'failed'
        ? { key: 'date', header: 'Failed', sortValue: (r) => new Date(r.failedAt ?? r.createdAt), cell: (r) => <span className="whitespace-nowrap">{day(r.failedAt ?? r.createdAt)}</span> }
        : { key: 'date', header: 'Date', sortValue: (r) => new Date(r.paidAt ?? r.createdAt), cell: (r) => <span className="whitespace-nowrap">{day(r.paidAt ?? r.createdAt)}</span> };
    const account: Column<Row> = {
      key: 'account', header: 'Account', sortValue: (r) => r.account,
      searchValue: (r) => `${r.account} ${r.email} ${r.invoiceNumber ?? ''} ${r.creditNoteNumber ?? ''} ${r.razorpayId ?? ''}`,
      cell: (r) => <><span className="font-semibold text-gray-900 dark:text-white">{r.account}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{r.email}</span></>,
    };
    const stream: Column<Row> = { key: 'stream', header: 'Stream', sortValue: (r) => r.stream, cell: (r) => <span className="whitespace-nowrap">{STREAM_LABEL[r.stream]}</span> };
    const product: Column<Row> = {
      key: 'product', header: 'Product', sortValue: (r) => r.product, searchValue: (r) => r.product,
      cell: (r) => (
        <span className="whitespace-nowrap">{r.product}
          <span className="block text-xs text-gray-600 dark:text-gray-400">
            {CYCLE_LABEL[r.cycle]}{r.foundingPrice ? ' · founding price' : ''}{!r.online ? ' · invoice or UPI' : ''}
          </span>
        </span>
      ),
    };
    const total: Column<Row> = {
      key: 'total', header: 'Paid', align: 'right', sortValue: (r) => r.totalPaise,
      cell: (r) => <span className="tabular-nums whitespace-nowrap">{rupees(r.totalPaise)}<span className="block text-xs text-gray-600 dark:text-gray-400">{rupees(r.gstPaise)} GST</span></span>,
    };

    if (view === 'failed') {
      return [date, account, ...(showStream ? [stream] : []), product,
        { key: 'total', header: 'Amount', align: 'right', sortValue: (r) => r.totalPaise, cell: (r) => <span className="tabular-nums whitespace-nowrap">{rupees(r.totalPaise)}</span> },
        {
          key: 'outcome', header: 'Since then', sortValue: (r) => (r.recovered ? 1 : 0),
          cell: (r) => r.recovered
            ? <span className="text-xs font-semibold text-green-700 dark:text-green-400">Paid later</span>
            : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Not recovered</span>,
        },
        { key: 'razorpay', header: 'Razorpay ID', cell: (r) => (r.razorpayId ? <span className="text-xs font-mono select-all">{r.razorpayId}</span> : '–') },
      ];
    }
    if (view === 'refunds') {
      return [date, account, ...(showStream ? [stream] : []), product,
        { key: 'refund', header: 'Refunded', align: 'right', sortValue: (r) => r.refundAmountPaise ?? 0, cell: (r) => <span className="tabular-nums whitespace-nowrap">{rupees(r.refundAmountPaise ?? 0)}<span className="block text-xs text-gray-600 dark:text-gray-400">of {rupees(r.totalPaise)}</span></span> },
        { key: 'reason', header: 'Reason', searchValue: (r) => r.refundReason ?? '', cell: (r) => <span className="block max-w-xs">{r.refundReason || '–'}{r.refundedBy && <span className="block text-xs text-gray-600 dark:text-gray-400">by {r.refundedBy}</span>}</span> },
        { key: 'note', header: 'Credit note', cell: (r) => (r.creditNoteNumber ? <span className="text-xs font-mono select-all">{r.creditNoteNumber}</span> : <span className="text-xs text-amber-700 dark:text-amber-400">{r.stream === 'ADS' ? 'Not issued here' : 'Not issued yet'}</span>) },
      ];
    }
    return [date, account, ...(showStream ? [stream] : []), product, total,
      { key: 'net', header: 'Net revenue', align: 'right', sortValue: (r) => r.netPaise, cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.state === 'FAILED' ? '–' : rupees(r.netPaise)}</span> },
      {
        key: 'status', header: 'Status', sortValue: (r) => r.state,
        cell: (r) => (
          <span className={`text-xs font-semibold whitespace-nowrap ${STATE_STYLE[r.state]}`} title={r.refundReason ?? undefined}>
            {STATE_LABEL[r.state]}{r.refundedAt ? ` ${rupees(r.refundAmountPaise ?? 0)}` : ''}
            {r.invoiceNumber && <span className="block font-mono font-normal text-gray-600 dark:text-gray-400">{r.invoiceNumber}</span>}
          </span>
        ),
      },
      {
        key: 'actions', header: 'Actions', align: 'right',
        cell: (r) => r.state !== 'PAID' ? null : r.stream === 'ADS'
          ? <Link href="/advertise/payments" className="text-xs font-semibold text-brand hover:underline whitespace-nowrap">Refund in Ad payments</Link>
          : <button type="button" onClick={() => setRefund(r)} aria-label={`Refund ${r.account}, ${r.product}`} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"><RotateCcw className="w-3.5 h-3.5" aria-hidden /> Refund</button>,
      },
    ];
  }, [view, showStream]);

  const filters = useMemo<TableFilter<Row>[]>(() => {
    const streams = [...new Set(rows.map((r) => r.stream))] as Stream[];
    const products = [...new Map(rows.map((r) => [r.product, r.product])).keys()].sort();
    const list: TableFilter<Row>[] = [];
    if (view === 'all') list.push({ key: 'status', label: 'Status', options: options(STATE_LABEL), matches: (r, v) => r.state === v });
    if (view === 'failed') list.push({ key: 'outcome', label: 'Since then', options: [{ value: 'open', label: 'Not recovered' }, { value: 'recovered', label: 'Paid later' }], matches: (r, v) => !!r.recovered === (v === 'recovered') });
    if (showStream && streams.length > 1) list.push({ key: 'stream', label: 'Stream', options: options(STREAM_LABEL, streams), matches: (r, v) => r.stream === v });
    if (products.length > 1 && products.length <= 20) list.push({ key: 'product', label: 'Product', options: products.map((p) => ({ value: p, label: p })), matches: (r, v) => r.product === v });
    list.push({ key: 'cycle', label: 'Billing', options: options(CYCLE_LABEL), matches: (r, v) => r.cycle === v });
    list.push({ key: 'method', label: 'Paid by', options: [{ value: 'online', label: 'Razorpay' }, { value: 'manual', label: 'Invoice or UPI' }], matches: (r, v) => r.online === (v === 'online') });
    list.push({ key: 'year', label: 'Year', options: [...new Set(rows.map((r) => (r.paidAt ?? r.createdAt).slice(0, 4)))].sort().reverse().map((y) => ({ value: y, label: y })), matches: (r, v) => (r.paidAt ?? r.createdAt).startsWith(v) });
    return list;
  }, [rows, view, showStream]);

  const noun = view === 'failed' ? 'failed payments' : view === 'refunds' ? 'refunds' : 'payments';
  return (
    <section aria-labelledby={`${tableId}-title`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${tableId}-title`} className="portal-section-title">{title}</h2>
        <button type="button" onClick={() => downloadCsv(rows, tableId)} disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
          <Download className="w-4 h-4" aria-hidden /> Download CSV
        </button>
      </div>
      <DataTable tableId={tableId} noun={noun} rows={rows} rowKey={(r) => `${r.stream}-${r.id}`} columns={columns} filters={filters} pageSize={25}
        searchPlaceholder="Search account, email, product, invoice or Razorpay ID"
        empty={view === 'failed'
          ? { title: 'No failed payments', description: 'Payments that Razorpay declined appear here.' }
          : view === 'refunds'
            ? { title: 'No refunds yet', description: 'Refunded payments appear here with the reason and the credit note.' }
            : { title: 'No payments yet', description: 'Successful and failed payments appear here.' }} />
      {refund && <RefundDialog p={refund} onClose={() => setRefund(null)} onDone={(msg) => { setRefund(null); notify(msg, 'success'); router.refresh(); }} />}
    </section>
  );
}

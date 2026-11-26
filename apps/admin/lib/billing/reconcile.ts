import { fyStart, monthKey } from './periods';
import { CYCLE_LABEL, STREAM_LABEL, type LedgerRow, type Stream } from './types';

/**
 * Month-by-month figures for matching the books and filing GST, for one Indian financial year (April to March).
 *
 * A sale is counted in the month the payment arrived. A refund is counted in the month it was made (the month of
 * its credit note), which can be later than the sale. GST on a refund is the same share of the refund as GST was
 * of the original payment. All amounts are paise.
 */
export interface ReconLine {
  payments: number;
  /** What customers paid, GST included. */
  collected: number;
  /** GST inside `collected` (output GST). */
  gst: number;
  /** collected − gst. */
  taxable: number;
  refundCount: number;
  /** Returned to customers, GST included. */
  refunded: number;
  /** GST inside `refunded` (reversed by credit notes). */
  gstReversed: number;
  /** taxable − (refunded − gstReversed). */
  netTaxable: number;
  /** gst − gstReversed: the GST payable on these sales. */
  netGst: number;
  /** collected − refunded: customer money kept, before Razorpay's own fee. */
  netCollected: number;

  // Razorpay settlement. Payments recorded by hand (invoice, UPI transfer) never pass through Razorpay.
  /** Paid through Razorpay, GST included. */
  onlineCollected: number;
  /** Refunded through Razorpay, GST included. */
  onlineRefunded: number;
  /** collected and refunded outside Razorpay, netted: money that reached (or left) the bank directly. */
  offlineNet: number;
  /** Razorpay's fee before GST. */
  gatewayFee: number;
  /** GST Razorpay charged on its fee: input credit. */
  gatewayGst: number;
  /** onlineCollected − onlineRefunded − gatewayFee − gatewayGst: what Razorpay should pay out for these payments. */
  settlement: number;
  /** Razorpay payments in this line whose fee is not known yet; while above zero, the fee columns are too low. */
  feeMissing: number;
}
export interface ReconMonth extends ReconLine { key: string; label: string }

const blank = (): ReconLine => ({
  payments: 0, collected: 0, gst: 0, taxable: 0, refundCount: 0, refunded: 0, gstReversed: 0, netTaxable: 0, netGst: 0, netCollected: 0,
  onlineCollected: 0, onlineRefunded: 0, offlineNet: 0, gatewayFee: 0, gatewayGst: 0, settlement: 0, feeMissing: 0,
});
function finish(l: ReconLine): ReconLine {
  l.taxable = l.collected - l.gst;
  l.netTaxable = l.taxable - (l.refunded - l.gstReversed);
  l.netGst = l.gst - l.gstReversed;
  l.netCollected = l.collected - l.refunded;
  l.settlement = l.onlineCollected - l.onlineRefunded - l.gatewayFee - l.gatewayGst;
  return l;
}

/** The twelve months of the financial year starting in April of `startYear`, April first. */
export function fyMonths(startYear: number): { key: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(startYear, 3 + i, 15));
    return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  });
}

/** April-year of the financial year a moment falls in: 2026 for FY 2026-27. */
export const fyYearOf = (d: Date) => new Date(fyStart(d).getTime() + 5.5 * 36e5).getUTCFullYear();
export const fyName = (startYear: number) => `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

export interface Reconciliation { months: ReconMonth[]; total: ReconLine; byStream: Partial<Record<Stream, ReconLine>> }

export function reconcile(rows: LedgerRow[], startYear: number): Reconciliation {
  const months: ReconMonth[] = fyMonths(startYear).map((m) => ({ ...m, ...blank() }));
  const at = new Map(months.map((m) => [m.key, m]));
  const total = blank();
  const byStream: Partial<Record<Stream, ReconLine>> = {};
  const lines = (key: string, stream: Stream): ReconLine[] | null => {
    const month = at.get(key);
    return month ? [month, total, (byStream[stream] ??= blank())] : null;
  };

  for (const r of rows) {
    if (r.state !== 'FAILED' && r.paidAt) {
      for (const l of lines(monthKey(r.paidAt), r.stream) ?? []) {
        l.payments += 1;
        l.collected += r.totalPaise;
        l.gst += r.gstPaise;
        if (!r.online) { l.offlineNet += r.totalPaise; continue; }
        l.onlineCollected += r.totalPaise;
        if (r.gatewayFeePaise == null) { l.feeMissing += 1; continue; }
        const tax = Math.min(r.gatewayTaxPaise ?? 0, r.gatewayFeePaise);
        l.gatewayFee += r.gatewayFeePaise - tax;
        l.gatewayGst += tax;
      }
    }
    if (r.refundedAt && r.refundAmountPaise) {
      const refund = Math.min(r.refundAmountPaise, r.totalPaise);
      const gstBack = Math.round((refund * r.gstPaise) / Math.max(1, r.totalPaise));
      for (const l of lines(monthKey(r.refundedAt), r.stream) ?? []) {
        l.refundCount += 1;
        l.refunded += refund;
        l.gstReversed += gstBack;
        if (r.online) l.onlineRefunded += refund; else l.offlineNet -= refund;
      }
    }
  }
  months.forEach(finish);
  finish(total);
  Object.values(byStream).forEach((l) => l && finish(l));
  return { months, total, byStream };
}

/** Financial years that have any payment or refund, newest first; always includes the current one. */
export function fyYearsWithData(rows: LedgerRow[], now: Date): number[] {
  const years = new Set<number>([fyYearOf(now)]);
  for (const r of rows) {
    if (r.paidAt) years.add(fyYearOf(new Date(r.paidAt)));
    if (r.refundedAt) years.add(fyYearOf(new Date(r.refundedAt)));
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * One line per sale and one per refund, for the transaction-level CSV (the detail behind the monthly figures).
 * Refund lines carry negative amounts and the credit note number. Amounts are rupees, ready for a spreadsheet.
 */
export const TXN_HEAD = ['Date', 'Month', 'Type', 'Stream', 'Customer', 'Email', 'Product', 'Billing', 'Document no.', 'Taxable value', 'GST', 'Total', 'Paid by', 'Razorpay payment', 'Razorpay fee', 'GST on Razorpay fee', 'Note'] as const;
export interface TxnLine { month: string; at: string; cells: (string | number)[] }

const istDate = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 36e5).toISOString().slice(0, 10);

export function transactionLines(rows: LedgerRow[], startYear: number): TxnLine[] {
  const inYear = new Set(fyMonths(startYear).map((m) => m.key));
  const out: TxnLine[] = [];
  // Razorpay's fee belongs to the sale; refund lines leave it empty (the fee is not returned). Empty also when not fetched yet.
  const feeCells = (r: LedgerRow, type: 'Sale' | 'Refund'): (string | number)[] => {
    if (type === 'Refund' || !r.online || r.gatewayFeePaise == null) return ['', ''];
    const tax = Math.min(r.gatewayTaxPaise ?? 0, r.gatewayFeePaise);
    return [(r.gatewayFeePaise - tax) / 100, tax / 100];
  };
  const line = (r: LedgerRow, at: string, type: 'Sale' | 'Refund', taxable: number, gst: number, doc: string | null, note: string | null): TxnLine => ({
    month: monthKey(at), at,
    cells: [istDate(at), monthKey(at), type, STREAM_LABEL[r.stream], r.account, r.email, r.product, CYCLE_LABEL[r.cycle], doc ?? '',
      taxable / 100, gst / 100, (taxable + gst) / 100, r.online ? 'Razorpay' : 'Invoice or UPI', r.razorpayId ?? '', ...feeCells(r, type), note ?? ''],
  });
  for (const r of rows) {
    if (r.state !== 'FAILED' && r.paidAt && inYear.has(monthKey(r.paidAt))) {
      out.push(line(r, r.paidAt, 'Sale', r.totalPaise - r.gstPaise, r.gstPaise, r.invoiceNumber, null));
    }
    if (r.refundedAt && r.refundAmountPaise && inYear.has(monthKey(r.refundedAt))) {
      const refund = Math.min(r.refundAmountPaise, r.totalPaise);
      const gstBack = Math.round((refund * r.gstPaise) / Math.max(1, r.totalPaise));
      const against = r.invoiceNumber ? `Against invoice ${r.invoiceNumber}` : '';
      out.push(line(r, r.refundedAt, 'Refund', -(refund - gstBack), -gstBack, r.creditNoteNumber, [against, r.refundReason].filter(Boolean).join('. ') || null));
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

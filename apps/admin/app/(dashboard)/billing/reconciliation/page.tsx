import Link from 'next/link';
import { getBilling } from '@/lib/billing/request';
import { fyMonths, fyName, fyYearOf, fyYearsWithData, reconcile, transactionLines, TXN_HEAD, type ReconLine } from '@/lib/billing/reconcile';
import { STREAM_LABEL, type Stream } from '@/lib/billing/types';
import { card, Stat } from '@/components/billing/parts';
import ReconDownload from '@/components/billing/ReconDownload';
import FeeSync from '@/components/billing/FeeSync';
import { count, rupees } from '@/components/billing/format';

const STREAMS: Stream[] = ['EMPLOYER', 'HOST', 'FUNDING', 'ADS'];
type Col = { key: keyof ReconLine; label: string; money: boolean; strong?: boolean };
const COLUMNS: Col[] = [
  { key: 'payments', label: 'Payments', money: false },
  { key: 'collected', label: 'Collected (GST included)', money: true },
  { key: 'taxable', label: 'Taxable value', money: true },
  { key: 'gst', label: 'GST collected', money: true },
  { key: 'refunded', label: 'Refunded (GST included)', money: true },
  { key: 'gstReversed', label: 'GST reversed', money: true },
  { key: 'netTaxable', label: 'Net taxable value', money: true, strong: true },
  { key: 'netGst', label: 'Net GST payable', money: true, strong: true },
  { key: 'netCollected', label: 'Net kept from customers', money: true },
];
/** Razorpay side: what should arrive from Razorpay, and what it kept. */
const SETTLEMENT: Col[] = [
  { key: 'onlineCollected', label: 'Paid through Razorpay', money: true },
  { key: 'onlineRefunded', label: 'Refunded through Razorpay', money: true },
  { key: 'gatewayFee', label: 'Razorpay fee', money: true },
  { key: 'gatewayGst', label: 'GST on fee (input credit)', money: true },
  { key: 'settlement', label: 'Expected from Razorpay', money: true, strong: true },
  { key: 'offlineNet', label: 'Received outside Razorpay', money: true },
  { key: 'feeMissing', label: 'Payments without fee yet', money: false },
];
/** Negative months happen (a refund with no sale that month): shown with a minus sign, never hidden. */
const money = (paise: number) => (paise < 0 ? `−${rupees(-paise)}` : rupees(paise));
const th = 'px-3 py-2 font-medium text-right whitespace-nowrap';
const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

function Row({ label, line, bold, action, cols }: { label: string; line: ReconLine; bold?: boolean; action?: React.ReactNode; cols: Col[] }) {
  return (
    <tr className={bold ? 'font-semibold text-gray-900 dark:text-white' : undefined}>
      <th scope="row" className="px-3 py-2 text-left font-medium text-gray-900 dark:text-white whitespace-nowrap">{label}</th>
      {cols.map((c) => <td key={c.key} className={`${td} ${c.strong ? 'font-semibold text-gray-900 dark:text-white' : ''}`}>{c.money ? money(line[c.key]) : count(line[c.key])}</td>)}
      {action !== undefined && <td className="px-3 py-2 text-right">{action}</td>}
    </tr>
  );
}

function ReconTable({ caption, first, rows, total, actionHead, cols = COLUMNS }: {
  cols?: Col[]; caption: string; first: string; rows: { label: string; line: ReconLine; action?: React.ReactNode }[]; total: ReconLine;
  /** Heading of a last column holding each row's action (the month download). */
  actionHead?: string;
}) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm min-w-[1080px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
            <th scope="col" className="px-3 py-2 font-medium text-left">{first}</th>
            {cols.map((c) => <th scope="col" key={c.key} className={th}>{c.label}</th>)}
            {actionHead && <th scope="col" className={th}>{actionHead}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
          {rows.map((r) => <Row key={r.label} label={r.label} line={r.line} cols={cols} action={actionHead ? r.action ?? null : undefined} />)}
          <Row label="Total" line={total} bold cols={cols} action={actionHead ? null : undefined} />
        </tbody>
      </table>
    </div>
  );
}

export default async function BillingReconciliationPage(props: { searchParams: Promise<{ fy?: string }> }) {
  const { rows, ticketFees, now, feesReady } = await getBilling();
  const years = fyYearsWithData(rows, now);
  const asked = Number((await props.searchParams).fy);
  const year = years.includes(asked) ? asked : fyYearOf(now);
  const recon = reconcile(rows, year);
  const months = fyMonths(year);
  const ticketTotal = months.reduce((n, m) => n + (ticketFees[m.key] ?? 0), 0);
  // The summary file carries both halves: the GST side and the Razorpay side.
  const CSV_COLS = [...COLUMNS, ...SETTLEMENT];
  const csvHead = ['Month', ...CSV_COLS.map((c) => c.label)];
  const csvLine = (label: string, l: ReconLine) => [label, ...CSV_COLS.map((c) => (c.money ? l[c.key] / 100 : String(l[c.key])))];
  const missingAll = rows.filter((r) => r.online && r.razorpayId && r.state !== 'FAILED' && r.gatewayFeePaise == null).length;
  const txns = transactionLines(rows, year);
  const txnsOf = (key: string) => txns.filter((t) => t.month === key).map((t) => t.cells);
  const fileYear = fyName(year).replace(' ', '-');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Financial year" className="flex flex-wrap gap-1">
          {years.map((y) => (
            <Link key={y} href={y === fyYearOf(now) ? '/billing/reconciliation' : `/billing/reconciliation?fy=${y}`} aria-current={y === year ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${y === year ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              {fyName(y)}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">{fyName(year)}, whole year:</span>
          <ReconDownload label="Monthly summary" describe={`Download the ${fyName(year)} monthly summary as CSV`} fileName={`reconciliation-${fileYear}-summary`} head={csvHead}
            lines={[...recon.months.map((m) => csvLine(m.label, m)), csvLine('Total', recon.total)]} />
          <ReconDownload label="All transactions" describe={`Download every sale and refund of ${fyName(year)} as CSV`} fileName={`reconciliation-${fileYear}-transactions`} head={TXN_HEAD}
            lines={txns.map((t) => t.cells)} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Collected from customers" value={money(recon.total.collected)} hint={`${count(recon.total.payments)} payments, GST included`} />
        <Stat label="Net taxable value" value={money(recon.total.netTaxable)} hint="After refunds, before GST" />
        <Stat label="Net GST payable" value={money(recon.total.netGst)} hint={`${money(recon.total.gst)} collected − ${money(recon.total.gstReversed)} reversed`} />
        <Stat label="Refunded" value={money(recon.total.refunded)} hint={`${count(recon.total.refundCount)} refunds, GST included`} />
      </div>

      <section aria-labelledby="recon-months" className="space-y-3">
        <h2 id="recon-months" className="portal-section-title">{fyName(year)}, month by month</h2>
        <ReconTable caption={`Reconciliation for ${fyName(year)} by month`} first="Month" actionHead="Transactions CSV" total={recon.total}
          rows={recon.months.map((m) => ({
            label: m.label, line: m,
            action: <ReconDownload small label="Download" describe={`Download ${m.label} sales and refunds as CSV`} fileName={`reconciliation-${m.key}-transactions`} head={TXN_HEAD} lines={txnsOf(m.key)} />,
          }))} />
        <p className="text-xs text-gray-600 dark:text-gray-400">Each month&rsquo;s file lists every sale and refund behind that row: date, customer, product, invoice or credit note number, taxable value, GST and total. Refunds are negative, so the file adds up to the row.</p>
      </section>

      <section aria-labelledby="recon-streams" className="space-y-3">
        <h2 id="recon-streams" className="portal-section-title">{fyName(year)}, by revenue stream</h2>
        <ReconTable caption={`Reconciliation for ${fyName(year)} by revenue stream`} first="Stream"
          rows={STREAMS.filter((s) => recon.byStream[s]).map((s) => ({ label: STREAM_LABEL[s], line: recon.byStream[s]! }))} total={recon.total} />
      </section>

      <section aria-labelledby="recon-settle" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 id="recon-settle" className="portal-section-title">Razorpay settlement, {fyName(year)}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">What Razorpay kept and what it should pay out: paid through Razorpay, less refunds, less its fee and the GST on that fee. Match &ldquo;Expected from Razorpay&rdquo; against the settlements in your bank statement.</p>
          </div>
          {feesReady && <FeeSync missing={missingAll} />}
        </div>
        {!feesReady ? (
          <p role="status" className="text-sm rounded-lg px-3 py-2 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            Razorpay fees can&rsquo;t be stored yet: the database change for them has not been applied. Until then the fee columns show ₹0 and &ldquo;Expected from Razorpay&rdquo; is too high.
          </p>
        ) : recon.total.feeMissing > 0 ? (
          <p role="status" className="text-sm rounded-lg px-3 py-2 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            {count(recon.total.feeMissing)} Razorpay payment{recon.total.feeMissing === 1 ? '' : 's'} in {fyName(year)} {recon.total.feeMissing === 1 ? 'has' : 'have'} no fee stored yet, so the fee columns are too low and &ldquo;Expected from Razorpay&rdquo; is too high. Use Sync Razorpay fees.
          </p>
        ) : null}
        <ReconTable cols={SETTLEMENT} caption={`Razorpay settlement for ${fyName(year)} by month`} first="Month" rows={recon.months.map((m) => ({ label: m.label, line: m }))} total={recon.total} />
      </section>

      <section aria-labelledby="recon-notes" className={`${card} p-4 space-y-2 text-sm text-gray-700 dark:text-gray-300 max-w-4xl`}>
        <h2 id="recon-notes" className="portal-section-title">How to read this</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>A sale is counted in the month the payment arrived (India time). A refund is counted in the month it was made, which is the month of its credit note, even when the sale was earlier.</li>
          <li>GST reversed is the same share of each refund as GST was of the original payment.</li>
          <li>Razorpay&rsquo;s fee and the GST on it are read from Razorpay for each payment and counted in the month of the payment. Razorpay pays out a few days after a payment, so a month&rsquo;s &ldquo;Expected from Razorpay&rdquo; can land in the bank partly in the next month; over the year they should agree.</li>
          <li>Razorpay keeps its fee when a payment is refunded, so a refund reduces the settlement by the full refund and the fee is not returned.</li>
          <li>Payments recorded by hand (invoice or UPI transfer) don&rsquo;t pass through Razorpay: they are under &ldquo;Received outside Razorpay&rdquo;.</li>
          <li><strong>Ticket sales are left out.</strong> That money is collected for hosts. Udyaibase&rsquo;s fee on paid tickets in {fyName(year)} is {rupees(ticketTotal)}; whether GST is filed on the fee or on the full ticket value is for your accountant to confirm.</li>
          <li>Advertising refunds are recorded without a credit note here, so check those against your own records.</li>
          <li>This is a working sheet for matching and filing, not a tax return.</li>
        </ul>
      </section>
    </div>
  );
}

import { byCycle, byProduct, health, monthlySeries, periodTotals } from '@/lib/billing/summary';
import { fyLabel, fyStart, monthStart } from '@/lib/billing/periods';
import { CYCLE_LABEL, type Cycle, type LedgerRow, type Stream } from '@/lib/billing/types';
import { Breakdown, MonthlyBars, Panel, Stat } from './parts';
import PaymentsTable from './PaymentsTable';
import { count, rupees } from './format';

const DAY = 864e5;

/**
 * One revenue stream's page: totals, the monthly trend, billing split by monthly / yearly / one-time, what sold,
 * payment health, then (from the page) anything specific to the stream, and every payment at the bottom.
 */
export default function StreamReport({ stream, rows, now, recurring, children }: {
  stream: Stream; rows: LedgerRow[]; now: Date;
  /** Show the monthly vs yearly split (plans); one-time streams leave it out. */
  recurring: boolean;
  children?: React.ReactNode;
}) {
  const mine = rows.filter((r) => r.stream === stream);
  const totals = periodTotals(mine, now);
  const fy = fyLabel(now);
  const month = byCycle(mine, monthStart(now));
  const year = byCycle(mine, fyStart(now));
  const products = byProduct(mine, fyStart(now));
  const h = health(mine, new Date(now.getTime() - 30 * DAY));
  const cycles = (['MONTHLY', 'ANNUAL', 'ONE_TIME'] as Cycle[]).filter((c) => year[c].count > 0 || month[c].count > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="This month" value={rupees(totals.thisMonth)} hint="So far, net of refunds, before GST" />
        <Stat label="Last month" value={rupees(totals.lastMonth)} hint="Full month" />
        <Stat label={fy} value={rupees(totals.fy)} hint="Since 1 April" />
        <Stat label="All time" value={rupees(totals.allTime)} />
      </div>

      <Panel id={`${stream}-trend`} title="Net revenue, last 12 months">
        <MonthlyBars points={monthlySeries(mine, now)} streams={[stream]} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {recurring && (
          <Panel id={`${stream}-cycle`} title="Monthly and yearly billing">
            <Breakdown
              head={['Billing', 'Payments this month', 'Net this month', `Payments ${fy}`, `Net ${fy}`]}
              rows={cycles.map((c) => [CYCLE_LABEL[c], count(month[c].count), rupees(month[c].net), count(year[c].count), rupees(year[c].net)])}
              empty="No payments yet this financial year." />
          </Panel>
        )}
        <Panel id={`${stream}-products`} title={`What sold in ${fy}`}>
          <Breakdown head={['Product', 'Payments', 'Net revenue']} rows={products.map((p) => [p.product, count(p.count), rupees(p.net)])} empty="No payments yet this financial year." />
        </Panel>
        <Panel id={`${stream}-health`} title="Last 30 days" action={h.failedCount > 0 ? { href: '/billing/failed', label: 'See failed payments' } : undefined}>
          <Breakdown
            head={['', 'Count', 'Amount']}
            rows={[
              ['Collected from customers (GST included)', count(h.paidCount), rupees(h.collected)],
              ['GST in that', '', rupees(h.gst)],
              ['Refunded', count(h.refundCount), rupees(h.refunds)],
              ['Failed payments', count(h.failedCount), rupees(h.failedValue)],
              ['Failed and not paid since', '', rupees(h.failedOpenValue)],
            ]}
            empty="" />
        </Panel>
      </div>

      {children}

      <PaymentsTable rows={mine} tableId={`billing-${stream.toLowerCase()}`} showStream={false} title="Payments" />
    </div>
  );
}

import Link from 'next/link';
import { getBilling } from '@/lib/billing/request';
import { employerSubscribers, hostSubscribers, MAX_PER_STREAM } from '@/lib/billing/ledger';
import { health, monthlySeries, periodTotals, periodTotalsFromMonths, type PeriodTotals } from '@/lib/billing/summary';
import { fyLabel, fyStart, monthStart } from '@/lib/billing/periods';
import { STREAM_HREF, STREAM_LABEL, type RevenueStream } from '@/lib/billing/types';
import { Breakdown, card, MonthlyBars, Panel, Stat, STREAM_COLOR } from '@/components/billing/parts';
import { count, day, rupees } from '@/components/billing/format';

const STREAMS: RevenueStream[] = ['EMPLOYER', 'HOST', 'TICKETS', 'FUNDING', 'ADS'];
const DAY = 864e5;

export default async function BillingOverviewPage() {
  const { rows, ticketFees, now } = await getBilling();
  const [employers, hosts] = await Promise.all([employerSubscribers(now), hostSubscribers(now)]);

  const perStream = Object.fromEntries(STREAMS.map((s) => [s, s === 'TICKETS' ? periodTotalsFromMonths(ticketFees, now) : periodTotals(rows.filter((r) => r.stream === s), now)])) as Record<RevenueStream, PeriodTotals>;
  const all = STREAMS.reduce<PeriodTotals>((t, s) => ({ thisMonth: t.thisMonth + perStream[s].thisMonth, lastMonth: t.lastMonth + perStream[s].lastMonth, fy: t.fy + perStream[s].fy, allTime: t.allTime + perStream[s].allTime }), { thisMonth: 0, lastMonth: 0, fy: 0, allTime: 0 });
  const fy = fyLabel(now);
  const h30 = health(rows, new Date(now.getTime() - 30 * DAY));
  const hMonth = health(rows, monthStart(now));
  const hFy = health(rows, fyStart(now));
  const capped = (['EMPLOYER', 'HOST', 'FUNDING', 'ADS'] as const).filter((s) => rows.filter((r) => r.stream === s).length >= MAX_PER_STREAM);

  const paying = [...employers, ...hosts].filter((s) => !s.trial);
  const soon = [...employers, ...hosts].filter((s) => new Date(s.endsAt).getTime() - now.getTime() <= 7 * DAY).sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  const planCounts = new Map<string, { label: string; monthly: number; yearly: number; trial: number }>();
  for (const s of [...employers, ...hosts]) {
    const key = `${s.planLabel === 'Host Pro' ? 'Event hosts' : 'Employers'} · ${s.planLabel}`;
    const c = planCounts.get(key) ?? { label: key, monthly: 0, yearly: 0, trial: 0 };
    if (s.trial) c.trial += 1; else if (s.cycle === 'ANNUAL') c.yearly += 1; else c.monthly += 1;
    planCounts.set(key, c);
  }

  return (
    <div className="space-y-5">
      {capped.length > 0 && (
        <p role="status" className="text-sm rounded-lg px-3 py-2 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          {capped.map((s) => STREAM_LABEL[s]).join(', ')}: only the newest {count(MAX_PER_STREAM)} payments are counted, so all-time totals leave out older ones.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Revenue this month" value={rupees(all.thisMonth)} hint={`Last month, full: ${rupees(all.lastMonth)}`} />
        <Stat label={`Revenue ${fy}`} value={rupees(all.fy)} hint={`All time: ${rupees(all.allTime)}`} />
        <Stat label="Paying subscribers" value={count(paying.length)} hint={`${count(paying.filter((s) => s.cycle === 'ANNUAL').length)} yearly · ${count(paying.filter((s) => s.cycle === 'MONTHLY').length)} monthly`} />
        <Stat label="Failed, not paid since (30 days)" value={rupees(h30.failedOpenValue)} hint={`${count(h30.failedCount)} failed payments in all`} tone={h30.failedOpenValue > 0 ? 'warn' : undefined} />
      </div>

      <Panel id="rev-trend" title="Net revenue by stream, last 12 months">
        <MonthlyBars points={monthlySeries(rows, now, 12, { TICKETS: ticketFees })} streams={STREAMS} />
      </Panel>

      <section aria-labelledby="streams-title" className={`${card} overflow-x-auto`}>
        <h2 id="streams-title" className="portal-section-title px-4 pt-4 pb-2">Where revenue comes from</h2>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-gray-600 dark:text-gray-400">
              <th className="px-4 py-2 font-medium">Stream</th>
              <th className="px-4 py-2 font-medium text-right">This month</th>
              <th className="px-4 py-2 font-medium text-right">Last month</th>
              <th className="px-4 py-2 font-medium text-right">{fy}</th>
              <th className="px-4 py-2 font-medium text-right">Share of {fy}</th>
              <th className="px-4 py-2 font-medium text-right">All time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {STREAMS.map((s) => (
              <tr key={s}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  <Link href={STREAM_HREF[s]} className="inline-flex items-center gap-2 text-gray-900 dark:text-white hover:underline">
                    <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ background: STREAM_COLOR[s] }} /> {STREAM_LABEL[s]}
                  </Link>
                </th>
                <td className="px-4 py-2.5 text-right tabular-nums">{rupees(perStream[s].thisMonth)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{rupees(perStream[s].lastMonth)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{rupees(perStream[s].fy)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{all.fy > 0 ? `${Math.round((perStream[s].fy / all.fy) * 100)}%` : '–'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{rupees(perStream[s].allTime)}</td>
              </tr>
            ))}
            <tr className="font-semibold text-gray-900 dark:text-white">
              <th scope="row" className="px-4 py-2.5 text-left">Total</th>
              <td className="px-4 py-2.5 text-right tabular-nums">{rupees(all.thisMonth)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{rupees(all.lastMonth)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{rupees(all.fy)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{all.fy > 0 ? '100%' : '–'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{rupees(all.allTime)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel id="money-title" title="Money in and out" action={{ href: '/billing/payments', label: 'All payments' }}>
          <Breakdown
            head={['Plans, boosts, data and ads', 'This month', fy]}
            rows={[
              ['Collected from customers (GST included)', rupees(hMonth.collected), rupees(hFy.collected)],
              ['GST in that', rupees(hMonth.gst), rupees(hFy.gst)],
              ['Refunded to customers', rupees(hMonth.refunds), rupees(hFy.refunds)],
              ['Failed payments', rupees(hMonth.failedValue), rupees(hFy.failedValue)],
            ]}
            empty="" />
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">Ticket sales are collected for the host; only Udyaibase&rsquo;s fee is revenue, so tickets are not in this table.</p>
        </Panel>

        <Panel id="plans-title" title="Active plans">
          <Breakdown head={['Plan', 'Monthly', 'Yearly', 'Free trial']} rows={[...planCounts.values()].map((c) => [c.label, count(c.monthly), count(c.yearly), count(c.trial)])} empty="Nobody is on a paid plan right now." />
        </Panel>

        <Panel id="ending-title" title={`Plans ending in the next 7 days · ${soon.length}`}>
          {soon.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">None.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {soon.map((s) => (
                <li key={`${s.planLabel}-${s.id}`} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                  <span className="font-semibold text-gray-900 dark:text-white">{s.name}</span>
                  <span className="text-gray-600 dark:text-gray-400">{s.planLabel}{s.trial ? ' (free trial)' : s.cycle === 'ANNUAL' ? ', yearly' : ', monthly'}</span>
                  <span className="ml-auto text-xs font-semibold text-amber-700 dark:text-amber-400">Ends {day(s.endsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

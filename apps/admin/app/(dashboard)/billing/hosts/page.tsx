import { getBilling } from '@/lib/billing/request';
import { hostSubscribers } from '@/lib/billing/ledger';
import { accountHistory } from '@/lib/billing/summary';
import StreamReport from '@/components/billing/StreamReport';
import SubscribersTable, { type SubscriberRow } from '@/components/billing/SubscribersTable';
import { ticketFeesByEvent } from '@/lib/billing/ledger';
import { periodTotalsFromMonths } from '@/lib/billing/summary';
import { fyLabel, fyStart } from '@/lib/billing/periods';
import { Breakdown, Panel, Stat } from '@/components/billing/parts';
import { count, day, rupees } from '@/components/billing/format';

export default async function BillingHostsPage() {
  const { rows, now, ticketFees } = await getBilling();
  const subscribers = await hostSubscribers(now);
  const history = accountHistory(rows, 'HOST');
  const list: SubscriberRow[] = subscribers.map((s) => {
    const h = history.get(s.id);
    return {
      ...s, daysLeft: Math.ceil((new Date(s.endsAt).getTime() - now.getTime()) / 864e5),
      lifetimeNet: h?.lifetimeNet ?? 0, payments: h?.payments ?? 0, lastPaidAt: h?.last?.paidAt ?? null, lastPaise: h?.last?.totalPaise ?? null,
    };
  });
  const tickets = periodTotalsFromMonths(ticketFees, now);
  const events = await ticketFeesByEvent(fyStart(now));
  const fy = fyLabel(now);

  return (
    <StreamReport stream="HOST" rows={rows} now={now} recurring>
      <section aria-labelledby="subs-title" className="space-y-3">
        <h2 id="subs-title" className="portal-section-title">Hosts on Pro · {list.length.toLocaleString('en-IN')}</h2>
        <SubscribersTable rows={list} tableId="billing-hosts-subscribers" noun="hosts" />
      </section>
      <section aria-labelledby="tickets-title" className="space-y-3">
        <div>
          <h2 id="tickets-title" className="portal-section-title">Ticket fees</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Udyaibase&rsquo;s share of paid tickets. The rest of each sale goes to the host, so it is not revenue and is not in the totals at the top of this page.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Fees this month" value={rupees(tickets.thisMonth)} />
          <Stat label="Fees last month" value={rupees(tickets.lastMonth)} />
          <Stat label={`Fees ${fy}`} value={rupees(tickets.fy)} />
          <Stat label="Fees all time" value={rupees(tickets.allTime)} />
        </div>
        <Panel id="ticket-events" title={`Paid-ticket events in ${fy}, by fee`}>
          <Breakdown
            head={['Event', 'Host', 'Tickets', 'Ticket sales', 'Our fee', 'Last sale']}
            rows={events.map((e) => [e.title, e.host, count(e.tickets), rupees(e.salesPaise), rupees(e.feesPaise), day(e.lastSaleAt)])}
            empty="No paid tickets sold yet this financial year." />
        </Panel>
      </section>
    </StreamReport>
  );
}

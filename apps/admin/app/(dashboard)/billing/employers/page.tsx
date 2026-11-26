import { getBilling } from '@/lib/billing/request';
import { employerSubscribers } from '@/lib/billing/ledger';
import { accountHistory } from '@/lib/billing/summary';
import StreamReport from '@/components/billing/StreamReport';
import SubscribersTable, { type SubscriberRow } from '@/components/billing/SubscribersTable';

export default async function BillingEmployersPage() {
  const { rows, now } = await getBilling();
  const subscribers = await employerSubscribers(now);
  const history = accountHistory(rows, 'EMPLOYER');
  const list: SubscriberRow[] = subscribers.map((s) => {
    const h = history.get(s.id);
    return {
      ...s, daysLeft: Math.ceil((new Date(s.endsAt).getTime() - now.getTime()) / 864e5),
      lifetimeNet: h?.lifetimeNet ?? 0, payments: h?.payments ?? 0, lastPaidAt: h?.last?.paidAt ?? null, lastPaise: h?.last?.totalPaise ?? null,
    };
  });

  return (
    <StreamReport stream="EMPLOYER" rows={rows} now={now} recurring>
      <section aria-labelledby="subs-title" className="space-y-3">
        <h2 id="subs-title" className="portal-section-title">Employers on a paid plan · {list.length.toLocaleString('en-IN')}</h2>
        <SubscribersTable rows={list} tableId="billing-employers-subscribers" noun="employers" />
      </section>
    </StreamReport>
  );
}

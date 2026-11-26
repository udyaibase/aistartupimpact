import { getBilling } from '@/lib/billing/request';
import { failedPayments } from '@/lib/billing/summary';
import PaymentsTable from '@/components/billing/PaymentsTable';
import { Stat } from '@/components/billing/parts';
import { count, rupees } from '@/components/billing/format';

export default async function BillingFailedPage() {
  const { rows, now } = await getBilling();
  const failed = failedPayments(rows);
  const since = now.getTime() - 30 * 864e5;
  const recent = failed.filter((r) => new Date(r.failedAt ?? r.createdAt).getTime() >= since);
  const open = recent.filter((r) => !r.recovered);
  const value = (list: typeof failed) => list.reduce((n, r) => n + r.totalPaise, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Failed in the last 30 days" value={count(recent.length)} hint={rupees(value(recent))} />
        <Stat label="Not paid since" value={count(open.length)} hint={`${rupees(value(open))} worth following up`} tone={open.length > 0 ? 'warn' : undefined} />
        <Stat label="Paid later" value={count(recent.length - open.length)} hint="The account went on to pay" />
        <Stat label="Failed, all time" value={count(failed.length)} hint={rupees(value(failed))} />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">A payment fails when Razorpay declines it (bank refusal, wrong OTP, timeout). &ldquo;Paid later&rdquo; means the same account has since paid for something in the same stream. Checkouts that were opened and abandoned are not failures and are not listed.</p>
      <PaymentsTable rows={failed} view="failed" tableId="billing-failed" title="Failed payments" />
    </div>
  );
}

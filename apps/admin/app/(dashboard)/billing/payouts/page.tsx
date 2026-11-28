import PayoutsTable from '@/components/billing/PayoutsTable';
import { card, Stat } from '@/components/billing/parts';
import { REVIEW_SLOW_DAYS } from '@/lib/billing/payouts';
import { loadPayoutRows } from '@/lib/billing/payouts-load';
import { count } from '@/components/billing/format';

export const dynamic = 'force-dynamic';

/** Host payout accounts: who can receive ticket money, who is waiting on Razorpay, and who is stuck. */
export default async function PayoutsPage() {
  const rows = await loadPayoutRows();
  const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const blocked = n((r) => r.blocked);
  const slow = n((r) => r.slow);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active" value={count(n((r) => r.status === 'ACTIVATED'))} hint="Can sell paid tickets and receive payouts" />
        <Stat label="Under review" value={count(n((r) => r.status === 'UNDER_REVIEW'))} hint={slow > 0 ? `${count(slow)} waiting ${REVIEW_SLOW_DAYS} days or more` : 'Razorpay is checking their details'} tone={slow > 0 ? 'warn' : undefined} />
        <Stat label="Needs details" value={count(n((r) => r.status === 'NEEDS_CLARIFICATION' || r.status === 'SUSPENDED'))} hint="Razorpay asked the host for more, or suspended the account" tone={n((r) => r.status === 'NEEDS_CLARIFICATION' || r.status === 'SUSPENDED') > 0 ? 'warn' : undefined} />
        <Stat label="Paid tickets, can’t sell" value={count(blocked)} hint="Hosts with a paid ticket but no active payout account" tone={blocked > 0 ? 'warn' : undefined} />
      </div>
      <p className={`${card} px-4 py-3 text-sm text-gray-700 dark:text-gray-300`}>
        Hosts set up payouts in their own portal, and their bank and identity details go straight to Razorpay; only the last 4 digits are kept here.
        Statuses update by themselves when Razorpay finishes a review and once a day. Re-check asks Razorpay now.
      </p>
      <PayoutsTable rows={rows} />
    </div>
  );
}

import Link from 'next/link';
import BillingTabs from '@/components/billing/BillingTabs';
import { getBilling } from '@/lib/billing/request';
import { failedPayments } from '@/lib/billing/summary';

export const metadata = { title: 'Billing | Admin' };

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const { rows, now } = await getBilling();
  const since = now.getTime() - 30 * 864e5;
  const failedOpen = failedPayments(rows).filter((r) => !r.recovered && new Date(r.failedAt ?? r.createdAt).getTime() >= since).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="portal-title">Billing and revenue</h1>
          <p className="portal-subtitle">Revenue is net of refunds and before GST, counted in India time on the day the payment arrived.</p>
        </div>
        <Link href="/plans" className="btn-outline text-sm shrink-0">Grant or end a plan</Link>
      </div>
      <BillingTabs failedOpen={failedOpen} />
      {children}
    </div>
  );
}

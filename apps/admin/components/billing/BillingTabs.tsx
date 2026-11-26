'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/billing', label: 'Overview' },
  { href: '/billing/employers', label: 'Employer plans' },
  { href: '/billing/hosts', label: 'Event hosts' },
  { href: '/billing/funding-data', label: 'Funding data' },
  { href: '/billing/advertising', label: 'Advertising' },
  { href: '/billing/payments', label: 'All payments' },
  { href: '/billing/failed', label: 'Failed' },
  { href: '/billing/refunds', label: 'Refunds' },
  { href: '/billing/reconciliation', label: 'Reconciliation' },
];

/** The billing section's tabs. Each is its own page, so a tab can be bookmarked and Back works. */
export default function BillingTabs({ failedOpen = 0 }: { failedOpen?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Billing sections" className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 -mx-1 px-1">
      {TABS.map((t) => {
        const active = t.href === '/billing' ? pathname === '/billing' : pathname?.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={`relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${active ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            {t.label}
            {t.href === '/billing/failed' && failedOpen > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 dark:bg-amber-400/20 text-amber-900 dark:text-amber-200 text-xs font-semibold leading-none tabular-nums" aria-label={`${failedOpen} not recovered in the last 30 days`}>{failedOpen}</span>
            )}
            {active && <span aria-hidden className="absolute left-2 right-2 bottom-0 h-0.5 rounded-t bg-brand" />}
          </Link>
        );
      })}
    </nav>
  );
}

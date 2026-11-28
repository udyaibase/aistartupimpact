'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { notify } from '@/components/Toast';
import { refreshPayoutAction } from '@/app/(dashboard)/billing/payouts/actions';
import { PAYOUT_LABEL, PAYOUT_STATUSES, type PayoutRow, type PayoutStatus } from '@/lib/billing/payouts';

const PILL: Record<PayoutStatus, string> = {
  ACTIVATED: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  UNDER_REVIEW: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  NEEDS_CLARIFICATION: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  SUSPENDED: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  NOT_STARTED: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–');

/** Every host's payout account status, with a per-host re-check against Razorpay. */
export default function PayoutsTable({ rows }: { rows: PayoutRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async (r: PayoutRow) => {
    setBusy(r.id);
    const res = await refreshPayoutAction(r.id, r.name);
    setBusy(null);
    if (!res.success) { notify(res.error, 'error'); return; }
    notify(`${r.name}: ${res.label}.`, 'success');
    router.refresh();
  };

  const columns = useMemo<Column<PayoutRow>[]>(() => [
    {
      key: 'host', header: 'Host', sortValue: (r) => r.name, searchValue: (r) => `${r.name} ${r.email} ${r.beneficiary ?? ''}`,
      cell: (r) => (
        <div className="min-w-[180px] max-w-xs">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{r.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Payout account', sortValue: (r) => PAYOUT_STATUSES.indexOf(r.status),
      cell: (r) => (
        <div>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${PILL[r.status]}`}>{PAYOUT_LABEL[r.status]}</span>
          {r.waitingDays != null && <p className={`mt-1 text-xs whitespace-nowrap ${r.slow ? 'font-semibold text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>{r.waitingDays === 0 ? 'Since today' : `${r.waitingDays} day${r.waitingDays === 1 ? '' : 's'} waiting`}</p>}
        </div>
      ),
    },
    {
      key: 'note', header: 'What Razorpay says',
      cell: (r) => <p className="min-w-[200px] max-w-sm text-xs text-gray-700 dark:text-gray-300 break-words">{r.note || (r.status === 'NOT_STARTED' ? 'The host has not submitted bank details yet.' : '–')}</p>,
    },
    {
      key: 'bank', header: 'Paid to', sortValue: (r) => r.beneficiary ?? '',
      cell: (r) => r.bankLast4
        ? <div className="whitespace-nowrap"><p className="text-sm">{r.beneficiary || '–'}</p><p className="text-xs text-gray-600 dark:text-gray-400 font-mono">Account ending {r.bankLast4}</p></div>
        : <span className="text-gray-500">–</span>,
    },
    {
      key: 'paid', header: 'Paid-ticket events', align: 'right', sortValue: (r) => r.paidEvents,
      cell: (r) => (
        <div className="text-right">
          <span className="tabular-nums">{r.paidEvents}</span>
          {r.blocked && <p className="text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">Can’t sell yet</p>}
        </div>
      ),
    },
    { key: 'updated', header: 'Last checked', sortValue: (r) => (r.updatedAt ? new Date(r.updatedAt) : null), cell: (r) => <span className="text-xs whitespace-nowrap">{day(r.updatedAt)}</span> },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (r) => r.status === 'NOT_STARTED' ? <span className="text-gray-500">–</span> : (
        <button type="button" onClick={() => refresh(r)} disabled={busy !== null} aria-label={`Re-check ${r.name} with Razorpay`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 whitespace-nowrap disabled:opacity-50">
          {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden />}
          Re-check
        </button>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handler; busy changes the buttons
  ], [busy]);

  const filters = useMemo<TableFilter<PayoutRow>[]>(() => [
    { key: 'status', label: 'Payout account', options: PAYOUT_STATUSES.map((s) => ({ value: s, label: `${PAYOUT_LABEL[s]} (${rows.filter((r) => r.status === s).length})` })), matches: (r, v) => r.status === v },
    { key: 'attention', label: 'Attention', options: [{ value: 'blocked', label: 'Paid tickets but can’t sell' }, { value: 'slow', label: 'Slow review' }], matches: (r, v) => (v === 'blocked' ? r.blocked : r.slow) },
  ], [rows]);

  return (
    <DataTable
      tableId="billing-payouts"
      noun="hosts"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      filters={filters}
      pageSize={25}
      searchPlaceholder="Search host, email or account holder"
      empty={{ title: 'No payout accounts yet', description: 'Hosts appear here when they start payout setup or add a paid ticket.' }}
    />
  );
}

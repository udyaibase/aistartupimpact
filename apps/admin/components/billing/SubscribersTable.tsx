'use client';

import { useMemo } from 'react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { day, rupees } from './format';

export interface SubscriberRow {
  id: string; name: string; email: string; plan: string; planLabel: string; cycle: 'MONTHLY' | 'ANNUAL'; trial: boolean; endsAt: string;
  /** Days until the plan ends, rounded up. */
  daysLeft: number;
  lifetimeNet: number; payments: number; lastPaidAt: string | null; lastPaise: number | null;
}

/** Who is on a paid plan right now: plan, billing cycle, when it ends, and what they have paid so far. */
export default function SubscribersTable({ rows, tableId, noun }: { rows: SubscriberRow[]; tableId: string; noun: string }) {
  const columns = useMemo<Column<SubscriberRow>[]>(() => [
    {
      key: 'account', header: 'Account', sortValue: (s) => s.name, searchValue: (s) => `${s.name} ${s.email}`,
      cell: (s) => <><span className="font-semibold text-gray-900 dark:text-white">{s.name}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{s.email}</span></>,
    },
    {
      key: 'plan', header: 'Plan', sortValue: (s) => s.planLabel,
      cell: (s) => <span className="whitespace-nowrap">{s.planLabel}{s.trial && <span className="ml-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">Free trial</span>}</span>,
    },
    { key: 'cycle', header: 'Billing', sortValue: (s) => s.cycle, cell: (s) => (s.trial ? '–' : s.cycle === 'ANNUAL' ? 'Yearly' : 'Monthly') },
    {
      key: 'ends', header: 'Ends', sortValue: (s) => new Date(s.endsAt),
      cell: (s) => (
        <span className="whitespace-nowrap">{day(s.endsAt)}
          <span className={`block text-xs ${s.daysLeft <= 7 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>{s.daysLeft <= 0 ? 'today' : `in ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}`}</span>
        </span>
      ),
    },
    {
      key: 'last', header: 'Last payment', sortValue: (s) => (s.lastPaidAt ? new Date(s.lastPaidAt) : null),
      cell: (s) => s.lastPaidAt ? <span className="whitespace-nowrap tabular-nums">{rupees(s.lastPaise ?? 0)}<span className="block text-xs text-gray-600 dark:text-gray-400">{day(s.lastPaidAt)}</span></span> : <span className="text-xs text-gray-600 dark:text-gray-400">No payment (granted)</span>,
    },
    { key: 'payments', header: 'Payments', align: 'right', sortValue: (s) => s.payments, cell: (s) => s.payments },
    { key: 'lifetime', header: 'Net revenue so far', align: 'right', sortValue: (s) => s.lifetimeNet, cell: (s) => <span className="tabular-nums">{rupees(s.lifetimeNet)}</span> },
  ], []);

  const filters = useMemo<TableFilter<SubscriberRow>[]>(() => [
    { key: 'plan', label: 'Plan', options: [...new Map(rows.map((s) => [s.plan, s.planLabel]))].map(([value, label]) => ({ value, label })), matches: (s, v) => s.plan === v },
    { key: 'cycle', label: 'Billing', options: [{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Yearly' }], matches: (s, v) => !s.trial && s.cycle === v },
    { key: 'kind', label: 'Type', options: [{ value: 'paid', label: 'Paying' }, { value: 'trial', label: 'Free trial' }, { value: 'granted', label: 'Granted, no payment' }], matches: (s, v) => (v === 'trial' ? s.trial : v === 'paid' ? !s.trial && s.payments > 0 : !s.trial && s.payments === 0) },
    { key: 'ends', label: 'Ends', options: [{ value: '7', label: 'Within 7 days' }, { value: '30', label: 'Within 30 days' }], matches: (s, v) => s.daysLeft <= Number(v) },
  ], [rows]);

  return (
    <DataTable tableId={tableId} noun={noun} rows={rows} rowKey={(s) => s.id} columns={columns} filters={filters} pageSize={20}
      searchPlaceholder="Search account or email"
      empty={{ title: 'Nobody on a paid plan right now', description: 'Accounts appear here while their paid plan is running.' }} />
  );
}

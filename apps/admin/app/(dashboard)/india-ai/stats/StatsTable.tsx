'use client';

import Link from 'next/link';
import { Edit } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { DeleteButton } from '../components/DeleteButton';

export interface StatRow {
  id: string;
  displayOrder: number;
  metricLabel: string;
  metricKey: string;
  metricValue: string;
  metricChange: string | null;
  metricIcon: string | null;
  isActive: boolean;
  lastUpdated: string | null;
}

const ACTIVE = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
const INACTIVE = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
const StatusPill = ({ active }: { active: boolean }) => (
  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${active ? ACTIVE : INACTIVE}`}>{active ? 'Active' : 'Inactive'}</span>
);
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
const editLink = 'p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

const COLUMNS: Column<StatRow>[] = [
  { key: 'order', header: 'Order', sortValue: (s) => s.displayOrder, cell: (s) => s.displayOrder, width: 'w-20' },
  {
    key: 'label', header: 'Label', sortValue: (s) => s.metricLabel, searchValue: (s) => `${s.metricLabel} ${s.metricKey}`,
    cell: (s) => <><span className="font-medium text-gray-900 dark:text-white">{s.metricLabel}</span><span className="block text-xs text-gray-600 dark:text-gray-400 font-mono">{s.metricKey}</span></>,
  },
  { key: 'value', header: 'Value', searchValue: (s) => s.metricValue, cell: (s) => <span className="font-semibold text-gray-900 dark:text-white">{s.metricValue}</span> },
  { key: 'change', header: 'Change', cell: (s) => s.metricChange || '–' },
  { key: 'icon', header: 'Icon', cell: (s) => s.metricIcon || '–' },
  { key: 'status', header: 'Status', sortValue: (s) => (s.isActive ? 0 : 1), cell: (s) => <StatusPill active={s.isActive} /> },
  {
    key: 'updated', header: 'Last updated', sortValue: (s) => (s.lastUpdated ? new Date(s.lastUpdated) : null),
    cell: (s) => <span className="whitespace-nowrap">{s.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–'}</span>,
  },
  {
    key: 'actions', header: 'Actions', align: 'right',
    cell: (s) => (
      <div className="flex items-center justify-end gap-1">
        <Link href={`/india-ai/stats/${s.id}/edit`} aria-label={`Edit ${s.metricLabel}`} title="Edit" className={editLink}><Edit className="w-4 h-4" aria-hidden /></Link>
        <DeleteButton itemId={s.id} itemName={s.metricLabel} deleteEndpoint={`/api/india-ai/stats/${s.id}/delete`} />
      </div>
    ),
  },
];
const FILTERS: TableFilter<StatRow>[] = [{ key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (s, v) => s.isActive === (v === 'active') }];

export default function StatsTable({ rows }: { rows: StatRow[] }) {
  return (
    <DataTable tableId="india-ai-stats" noun="statistics" rows={rows} rowKey={(s) => s.id} columns={COLUMNS} filters={FILTERS}
      searchPlaceholder="Search label, key or value"
      empty={{ title: 'No statistics yet', description: 'Add a statistic to show it as a live counter on the India AI page.' }} />
  );
}

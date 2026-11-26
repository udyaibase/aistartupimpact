'use client';

import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { optionsFrom, Pill, RowActions, StatusPill, STATUS_OPTIONS } from '../components/table-bits';

export interface PolicyRow {
  id: string; title: string; source: string; category: string; impact: string; link: string | null;
  displayOrder: number; date: string; isActive: boolean;
}

const IMPACT_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const IMPACT_STYLE: Record<string, string> = {
  High: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  Medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  Low: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
};
const COLUMNS: Column<PolicyRow>[] = [
  { key: 'title', header: 'Update', sortValue: (u) => u.title, searchValue: (u) => u.title, cell: (u) => <p className="font-medium text-gray-900 dark:text-white max-w-md">{u.title}</p> },
  { key: 'source', header: 'Source', sortValue: (u) => u.source, searchValue: (u) => u.source, cell: (u) => <Pill>{u.source}</Pill> },
  { key: 'category', header: 'Category', sortValue: (u) => u.category, searchValue: (u) => u.category, cell: (u) => u.category },
  {
    key: 'impact', header: 'Impact', sortValue: (u) => IMPACT_RANK[u.impact] ?? 3,
    cell: (u) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${IMPACT_STYLE[u.impact] ?? ''}`}>{u.impact}</span>,
  },
  {
    key: 'date', header: 'Date', sortValue: (u) => new Date(u.date),
    cell: (u) => <span className="whitespace-nowrap">{new Date(u.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>,
  },
  { key: 'status', header: 'Status', sortValue: (u) => (u.isActive ? 0 : 1), cell: (u) => <StatusPill active={u.isActive} /> },
  { key: 'actions', header: 'Actions', align: 'right', cell: (u) => <RowActions section="policy" id={u.id} name={u.title} links={[{ href: u.link, label: 'Open the source' }]} /> },
];

export default function PolicyTable({ rows }: { rows: PolicyRow[] }) {
  const filters: TableFilter<PolicyRow>[] = [
    { key: 'source', label: 'Source', options: optionsFrom(rows, (u) => u.source), matches: (u, v) => u.source === v },
    { key: 'impact', label: 'Impact', options: ['High', 'Medium', 'Low'].map((v) => ({ value: v, label: v })), matches: (u, v) => u.impact === v },
    { key: 'category', label: 'Category', options: optionsFrom(rows, (u) => u.category), matches: (u, v) => u.category === v },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (u, v) => u.isActive === (v === 'active') },
  ];
  return (
    <DataTable tableId="india-ai-policy" noun="policy updates" rows={rows} rowKey={(u) => u.id} columns={COLUMNS} filters={filters} pageSize={25}
      searchPlaceholder="Search title, source or category"
      empty={{ title: 'No policy updates yet', description: 'Add an update to show it on the India AI policy page.' }} />
  );
}

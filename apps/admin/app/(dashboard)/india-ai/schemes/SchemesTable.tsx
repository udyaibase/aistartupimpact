'use client';

import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { optionsFrom, Pill, RowActions, StatusPill, STATUS_OPTIONS } from '../components/table-bits';

export interface SchemeRow {
  id: string; name: string; shortName: string; category: string; state: string | null; fundingAmount: string;
  status: string; applicationDeadline: string; applyLink: string | null; displayOrder: number; isActive: boolean;
}

const COLUMNS: Column<SchemeRow>[] = [
  {
    key: 'scheme', header: 'Scheme', sortValue: (s) => s.shortName || s.name, searchValue: (s) => `${s.shortName} ${s.name}`,
    cell: (s) => (
      <div className="min-w-0 max-w-sm">
        <p className="font-medium text-gray-900 dark:text-white">{s.shortName || s.name}</p>
        {s.shortName && <p className="text-xs text-gray-600 dark:text-gray-400">{s.name}</p>}
      </div>
    ),
  },
  { key: 'category', header: 'Level', sortValue: (s) => s.category, cell: (s) => <>{s.category}{s.state && <span className="block text-xs text-gray-600 dark:text-gray-400">{s.state}</span>}</> },
  { key: 'funding', header: 'Funding', searchValue: (s) => s.fundingAmount, cell: (s) => s.fundingAmount || '–' },
  { key: 'applications', header: 'Applications', sortValue: (s) => s.status, cell: (s) => <Pill>{s.status}</Pill> },
  { key: 'deadline', header: 'Deadline', cell: (s) => s.applicationDeadline || '–' },
  { key: 'status', header: 'Status', sortValue: (s) => (s.isActive ? 0 : 1), cell: (s) => <StatusPill active={s.isActive} /> },
  { key: 'actions', header: 'Actions', align: 'right', cell: (s) => <RowActions section="schemes" id={s.id} name={s.shortName || s.name} links={[{ href: s.applyLink, label: 'Open the apply page' }]} /> },
];

export default function SchemesTable({ rows }: { rows: SchemeRow[] }) {
  const filters: TableFilter<SchemeRow>[] = [
    { key: 'category', label: 'Level', options: optionsFrom(rows, (s) => s.category), matches: (s, v) => s.category === v },
    { key: 'applications', label: 'Applications', options: optionsFrom(rows, (s) => s.status), matches: (s, v) => s.status === v },
    { key: 'state', label: 'State', options: optionsFrom(rows, (s) => s.state), matches: (s, v) => s.state === v },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (s, v) => s.isActive === (v === 'active') },
  ];
  return (
    <DataTable tableId="india-ai-schemes" noun="schemes" rows={rows} rowKey={(s) => s.id} columns={COLUMNS} filters={filters} pageSize={25}
      searchPlaceholder="Search scheme or funding"
      empty={{ title: 'No schemes yet', description: 'Add a government scheme to show it on the India AI schemes page.' }} />
  );
}

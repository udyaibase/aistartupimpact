'use client';

import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { Avatar, optionsFrom, RowActions, StatusPill, STATUS_OPTIONS } from '../components/table-bits';

export interface ResearcherRow {
  id: string; name: string; university: string; position: string; photoUrl: string | null; researchAreas: string[];
  linkedinUrl: string | null; googleScholarUrl: string | null; citations: number; hIndex: number; displayOrder: number; isActive: boolean;
}

const COLUMNS: Column<ResearcherRow>[] = [
  { key: 'order', header: 'Order', sortValue: (r) => r.displayOrder, cell: (r) => r.displayOrder, width: 'w-20' },
  {
    key: 'researcher', header: 'Researcher', sortValue: (r) => r.name, searchValue: (r) => `${r.name} ${r.position}`,
    cell: (r) => (
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={r.photoUrl} name={r.name} />
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white truncate">{r.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{r.position}</p>
        </div>
      </div>
    ),
  },
  { key: 'university', header: 'University', sortValue: (r) => r.university, searchValue: (r) => r.university, cell: (r) => r.university },
  {
    key: 'areas', header: 'Research areas', searchValue: (r) => r.researchAreas.join(' '),
    cell: (r) => r.researchAreas.length
      ? <span title={r.researchAreas.join(', ')}>{r.researchAreas.slice(0, 3).join(', ')}{r.researchAreas.length > 3 && ` +${r.researchAreas.length - 3}`}</span>
      : '–',
  },
  { key: 'citations', header: 'Citations', align: 'right', sortValue: (r) => r.citations, cell: (r) => <span className="tabular-nums">{r.citations.toLocaleString('en-IN')}</span> },
  { key: 'hIndex', header: 'h-index', align: 'right', sortValue: (r) => r.hIndex, cell: (r) => <span className="tabular-nums">{r.hIndex}</span> },
  { key: 'status', header: 'Status', sortValue: (r) => (r.isActive ? 0 : 1), cell: (r) => <StatusPill active={r.isActive} /> },
  {
    key: 'actions', header: 'Actions', align: 'right',
    cell: (r) => <RowActions section="researchers" id={r.id} name={r.name} links={[{ href: r.linkedinUrl, label: 'Open LinkedIn' }, { href: r.googleScholarUrl, label: 'Open Google Scholar' }]} />,
  },
];

export default function ResearchersTable({ rows }: { rows: ResearcherRow[] }) {
  const filters: TableFilter<ResearcherRow>[] = [
    { key: 'university', label: 'University', options: optionsFrom(rows, (r) => r.university), matches: (r, v) => r.university === v },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (r, v) => r.isActive === (v === 'active') },
  ];
  return (
    <DataTable tableId="india-ai-researchers" noun="researchers" rows={rows} rowKey={(r) => r.id} columns={COLUMNS} filters={filters} pageSize={25}
      searchPlaceholder="Search researcher, university or research area"
      empty={{ title: 'No researchers yet', description: 'Add a researcher to show them in the India AI researcher directory.' }} />
  );
}

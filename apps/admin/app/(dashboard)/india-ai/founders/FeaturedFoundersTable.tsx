'use client';

import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { Avatar, optionsFrom, Pill, RowActions, StatusPill, STATUS_OPTIONS } from '../components/table-bits';

export interface FeaturedFounderRow {
  id: string; name: string; startupName: string; achievement: string; category: string; fundingRaised: string | null;
  photoUrl: string | null; linkedinUrl: string | null; storyUrl: string | null; isActive: boolean; displayOrder: number;
}

const COLUMNS: Column<FeaturedFounderRow>[] = [
  { key: 'order', header: 'Order', sortValue: (f) => f.displayOrder, cell: (f) => f.displayOrder, width: 'w-20' },
  {
    key: 'founder', header: 'Founder', sortValue: (f) => f.name, searchValue: (f) => `${f.name} ${f.startupName}`,
    cell: (f) => (
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={f.photoUrl} name={f.name} />
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white truncate">{f.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{f.startupName}</p>
        </div>
      </div>
    ),
  },
  { key: 'category', header: 'Group', sortValue: (f) => f.category, cell: (f) => <Pill>{f.category}</Pill> },
  { key: 'achievement', header: 'Achievement', searchValue: (f) => f.achievement, cell: (f) => <p className="line-clamp-2 max-w-sm">{f.achievement || '–'}</p> },
  { key: 'funding', header: 'Funding raised', cell: (f) => f.fundingRaised || '–' },
  { key: 'status', header: 'Status', sortValue: (f) => (f.isActive ? 0 : 1), cell: (f) => <StatusPill active={f.isActive} /> },
  {
    key: 'actions', header: 'Actions', align: 'right',
    cell: (f) => <RowActions section="founders" id={f.id} name={f.name} links={[{ href: f.linkedinUrl, label: 'Open LinkedIn' }, { href: f.storyUrl, label: 'Open the story' }]} />,
  },
];

export default function FeaturedFoundersTable({ rows }: { rows: FeaturedFounderRow[] }) {
  const filters: TableFilter<FeaturedFounderRow>[] = [
    { key: 'category', label: 'Group', options: optionsFrom(rows, (f) => f.category), matches: (f, v) => f.category === v },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (f, v) => f.isActive === (v === 'active') },
  ];
  return (
    <DataTable tableId="india-ai-founders" noun="founders" rows={rows} rowKey={(f) => f.id} columns={COLUMNS} filters={filters} pageSize={25}
      searchPlaceholder="Search founder, startup or achievement"
      empty={{ title: 'No featured founders yet', description: 'Add a founder to show them in the India AI founder spotlight.' }} />
  );
}

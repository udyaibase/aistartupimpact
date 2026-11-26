'use client';

import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { Avatar, optionsFrom, Pill, RowActions, StatusPill, STATUS_OPTIONS } from '../components/table-bits';

export interface IndianToolRow {
  id: string; name: string; tagline: string; category: string; logoUrl: string | null; websiteUrl: string | null;
  headquarters: string | null; fundingStatus: string | null; isFeatured: boolean; isActive: boolean; displayOrder: number;
}

const COLUMNS: Column<IndianToolRow>[] = [
  { key: 'order', header: 'Order', sortValue: (t) => t.displayOrder, cell: (t) => t.displayOrder, width: 'w-20' },
  {
    key: 'tool', header: 'Tool', sortValue: (t) => t.name, searchValue: (t) => `${t.name} ${t.tagline}`,
    cell: (t) => (
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={t.logoUrl} name={t.name} square />
        <div className="min-w-0 max-w-sm">
          <p className="font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{t.tagline}</p>
        </div>
      </div>
    ),
  },
  { key: 'category', header: 'Category', sortValue: (t) => t.category, cell: (t) => <Pill>{t.category}</Pill> },
  { key: 'hq', header: 'Headquarters', sortValue: (t) => t.headquarters, searchValue: (t) => t.headquarters ?? '', cell: (t) => t.headquarters || '–' },
  { key: 'funding', header: 'Funding', sortValue: (t) => t.fundingStatus, cell: (t) => t.fundingStatus || '–' },
  { key: 'featured', header: 'Featured', sortValue: (t) => (t.isFeatured ? 0 : 1), cell: (t) => (t.isFeatured ? 'Yes' : 'No') },
  { key: 'status', header: 'Status', sortValue: (t) => (t.isActive ? 0 : 1), cell: (t) => <StatusPill active={t.isActive} /> },
  { key: 'actions', header: 'Actions', align: 'right', cell: (t) => <RowActions section="tools" id={t.id} name={t.name} links={[{ href: t.websiteUrl, label: 'Open the website' }]} /> },
];

export default function IndianToolsTable({ rows }: { rows: IndianToolRow[] }) {
  const filters: TableFilter<IndianToolRow>[] = [
    { key: 'category', label: 'Category', options: optionsFrom(rows, (t) => t.category), matches: (t, v) => t.category === v },
    { key: 'featured', label: 'Featured', options: [{ value: 'yes', label: 'Featured' }, { value: 'no', label: 'Not featured' }], matches: (t, v) => t.isFeatured === (v === 'yes') },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (t, v) => t.isActive === (v === 'active') },
  ];
  return (
    <DataTable tableId="india-ai-tools" noun="tools" rows={rows} rowKey={(t) => t.id} columns={COLUMNS} filters={filters} pageSize={25}
      searchPlaceholder="Search tool, tagline or city"
      empty={{ title: 'No tools yet', description: 'Add a Made in India AI tool to show it on the India AI tools page.' }} />
  );
}

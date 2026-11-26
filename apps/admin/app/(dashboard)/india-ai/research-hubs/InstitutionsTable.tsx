'use client';

import Link from 'next/link';
import { Edit, ExternalLink } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { DeleteButton } from '../components/DeleteButton';

export interface InstitutionRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  tag: string | null;
  category: string | null;
  aiCentre: string | null;
  displayOrder: number;
  link: string | null;
  isActive: boolean;
}

const ACTIVE = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
const INACTIVE = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
const StatusPill = ({ active }: { active: boolean }) => (
  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${active ? ACTIVE : INACTIVE}`}>{active ? 'Active' : 'Inactive'}</span>
);
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
const editLink = 'p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

const place = (i: InstitutionRow) => [i.city, i.state].filter(Boolean).join(', ');
const COLUMNS: Column<InstitutionRow>[] = [
  { key: 'order', header: 'Order', sortValue: (i) => i.displayOrder, cell: (i) => i.displayOrder, width: 'w-20' },
  {
    key: 'name', header: 'Institution', sortValue: (i) => i.name, searchValue: (i) => `${i.name} ${place(i)} ${i.tag ?? ''}`,
    cell: (i) => (
      <div className="min-w-0">
        <p className="font-medium text-gray-900 dark:text-white">{i.name}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400">{[place(i), i.tag].filter(Boolean).join(' · ')}</p>
      </div>
    ),
  },
  { key: 'state', header: 'State', sortValue: (i) => i.state, cell: (i) => i.state || '–' },
  { key: 'category', header: 'Category', sortValue: (i) => i.category, cell: (i) => i.category || '–' },
  { key: 'centre', header: 'AI centre', searchValue: (i) => i.aiCentre ?? '', cell: (i) => i.aiCentre || '–' },
  { key: 'status', header: 'Status', sortValue: (i) => (i.isActive ? 0 : 1), cell: (i) => <StatusPill active={i.isActive} /> },
  {
    key: 'actions', header: 'Actions', align: 'right',
    cell: (i) => (
      <div className="flex items-center justify-end gap-1">
        {i.link && (
          <a href={i.link} target="_blank" rel="noopener noreferrer" aria-label={`Open the website of ${i.name} (new tab)`} title="Open website" className={editLink}><ExternalLink className="w-4 h-4" aria-hidden /></a>
        )}
        <Link href={`/india-ai/research-hubs/${i.id}/edit`} aria-label={`Edit ${i.name}`} title="Edit" className={editLink}><Edit className="w-4 h-4" aria-hidden /></Link>
        <DeleteButton itemId={i.id} itemName={i.name} deleteEndpoint={`/api/india-ai/research-hubs/${i.id}/delete`} />
      </div>
    ),
  },
];

export default function InstitutionsTable({ rows }: { rows: InstitutionRow[] }) {
  const uniq = (pick: (i: InstitutionRow) => string | null) => [...new Set(rows.map(pick).filter((v): v is string => !!v))].sort().map((v) => ({ value: v, label: v }));
  const filters: TableFilter<InstitutionRow>[] = [
    { key: 'category', label: 'Category', options: uniq((i) => i.category), matches: (i, v) => i.category === v },
    { key: 'state', label: 'State', options: uniq((i) => i.state), matches: (i, v) => i.state === v },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (i, v) => i.isActive === (v === 'active') },
  ];
  return (
    <DataTable tableId="india-ai-institutions" noun="institutions" rows={rows} rowKey={(i) => i.id} columns={COLUMNS} filters={filters} pageSize={25}
      searchPlaceholder="Search institution, city or AI centre"
      empty={{ title: 'No institutions yet', description: 'Add a research institution to show it on the India AI research hubs page.' }} />
  );
}

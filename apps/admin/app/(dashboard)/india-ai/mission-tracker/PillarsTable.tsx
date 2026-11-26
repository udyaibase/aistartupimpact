'use client';

import Link from 'next/link';
import { Edit } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { DeleteButton } from '../components/DeleteButton';

export interface PillarRow {
  id: string;
  component: string;
  /** Rupees in crore. */
  allocatedCr: number;
  disbursedCr: number;
  /** Share of the active total, 0 to 100. */
  share: number;
  displayOrder: number;
  isActive: boolean;
}

const ACTIVE = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
const INACTIVE = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
const StatusPill = ({ active }: { active: boolean }) => (
  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${active ? ACTIVE : INACTIVE}`}>{active ? 'Active' : 'Inactive'}</span>
);
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
const editLink = 'p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

const cr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
const COLUMNS: Column<PillarRow>[] = [
  { key: 'order', header: 'Order', sortValue: (p) => p.displayOrder, cell: (p) => p.displayOrder, width: 'w-20' },
  { key: 'pillar', header: 'Pillar', sortValue: (p) => p.component, searchValue: (p) => p.component, cell: (p) => <span className="font-medium text-gray-900 dark:text-white">{p.component}</span> },
  { key: 'allocated', header: 'Allocated', align: 'right', sortValue: (p) => p.allocatedCr, cell: (p) => <span className="font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{cr(p.allocatedCr)}</span> },
  { key: 'disbursed', header: 'Disbursed', align: 'right', sortValue: (p) => p.disbursedCr, cell: (p) => <span className="tabular-nums whitespace-nowrap">{cr(p.disbursedCr)}</span> },
  { key: 'share', header: 'Share of total', align: 'right', sortValue: (p) => p.share, cell: (p) => <span className="tabular-nums">{p.isActive ? `${p.share.toFixed(1)}%` : '–'}</span> },
  { key: 'status', header: 'Status', sortValue: (p) => (p.isActive ? 0 : 1), cell: (p) => <StatusPill active={p.isActive} /> },
  {
    key: 'actions', header: 'Actions', align: 'right',
    cell: (p) => (
      <div className="flex items-center justify-end gap-1">
        <Link href={`/india-ai/mission-tracker/${p.id}/edit`} aria-label={`Edit ${p.component}`} title="Edit" className={editLink}><Edit className="w-4 h-4" aria-hidden /></Link>
        <DeleteButton itemId={p.id} itemName={p.component} deleteEndpoint={`/api/india-ai/mission-tracker/${p.id}/delete`} />
      </div>
    ),
  },
];
const FILTERS: TableFilter<PillarRow>[] = [{ key: 'status', label: 'Status', options: STATUS_OPTIONS, matches: (p, v) => p.isActive === (v === 'active') }];

export default function PillarsTable({ rows }: { rows: PillarRow[] }) {
  return (
    <DataTable tableId="india-ai-mission" noun="pillars" rows={rows} rowKey={(p) => p.id} columns={COLUMNS} filters={FILTERS}
      searchPlaceholder="Search pillar"
      empty={{ title: 'No mission pillars yet', description: 'Add a pillar to show its budget on the IndiaAI Mission tracker.' }} />
  );
}

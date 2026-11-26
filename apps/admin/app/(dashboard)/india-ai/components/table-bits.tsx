'use client';

import Link from 'next/link';
import { Edit, ExternalLink } from 'lucide-react';
import { DeleteButton } from './DeleteButton';

/** Shared pieces for the India AI list tables. */
const ACTIVE = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
const INACTIVE = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
const iconLink = 'p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

export const STATUS_OPTIONS = [{ value: 'active', label: 'Shown on site' }, { value: 'inactive', label: 'Hidden' }];

export function StatusPill({ active }: { active: boolean }) {
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${active ? ACTIVE : INACTIVE}`}>{active ? 'Shown' : 'Hidden'}</span>;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${INACTIVE}`}>{children}</span>;
}

/** Unique values of a field, as filter options. */
export function optionsFrom<T>(rows: T[], pick: (row: T) => string | null | undefined) {
  return [...new Set(rows.map(pick).filter((v): v is string => !!v))].sort().map((v) => ({ value: v, label: v }));
}

/** Small round picture, or the first letter when there is none. */
export function Avatar({ src, name, square }: { src: string | null; name: string; square?: boolean }) {
  const shape = square ? 'rounded-lg' : 'rounded-full';
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className={`w-9 h-9 ${shape} object-cover bg-gray-100 dark:bg-gray-800 shrink-0`} />
    : <span aria-hidden className={`w-9 h-9 ${shape} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center text-sm font-semibold shrink-0`}>{name.charAt(0).toUpperCase()}</span>;
}

export function RowActions({ section, id, name, links = [] }: { section: string; id: string; name: string; links?: { href: string | null; label: string }[] }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {links.filter((l) => l.href).map((l) => (
        <a key={l.label} href={l.href!} target="_blank" rel="noopener noreferrer" aria-label={`${l.label} for ${name} (new tab)`} title={l.label} className={iconLink}>
          <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
      ))}
      <Link href={`/india-ai/${section}/${id}/edit`} aria-label={`Edit ${name}`} title="Edit" className={iconLink}><Edit className="w-4 h-4" aria-hidden /></Link>
      <DeleteButton itemId={id} itemName={name} deleteEndpoint={`/api/india-ai/${section}/${id}/delete`} />
    </div>
  );
}

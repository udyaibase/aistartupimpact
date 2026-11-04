'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import ListingCard from './ListingCard';

export type ListingRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  claimStatus: string;
  isVerified?: boolean;
  isApproved?: boolean;
  role?: string;
  pendingEdits?: number;
};

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'live', label: 'Live', match: (s: string) => s === 'CLAIMED' || s === 'VERIFIED' },
  { key: 'review', label: 'In review', match: (s: string) => s === 'PENDING' },
  { key: 'rejected', label: 'Not approved', match: (s: string) => s === 'REJECTED' },
] as const;

/** A founder's listings, with search by name or tagline and a filter by status. */
export default function ListingsList({ items, type }: { items: ListingRow[]; type: 'startup' | 'tool' }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, items.filter((i) => f.match(i.claimStatus)).length])),
    [items],
  );

  const q = query.trim().toLowerCase();
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = items.filter((i) =>
    active.match(i.claimStatus) && (!q || i.name.toLowerCase().includes(q) || (i.tagline ?? '').toLowerCase().includes(q)));

  const noun = type === 'startup' ? 'startups' : 'tools';

  return (
    <>
      {items.length > 1 && <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search your ${noun}`}
            aria-label={`Search your ${noun}`}
            className="w-full pl-9 pr-4 py-2 text-base sm:text-sm border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div role="group" aria-label="Filter by status" className="flex gap-1.5 overflow-x-auto">
          {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 min-h-[40px] px-3 rounded-lg border text-sm font-medium ${
                filter === f.key
                  ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
                  : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>}

      {shown.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 px-4 py-8 text-center font-jakarta">
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No {noun} match</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Try a different search or show all your {noun}.</p>
          <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="mt-3 text-sm font-semibold text-brand hover:underline min-h-[40px]">
            Clear search and filter
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((i) => (
            <ListingCard
              key={i.id}
              id={i.id}
              slug={i.slug}
              name={i.name}
              tagline={i.tagline}
              logoUrl={i.logoUrl}
              status={i.claimStatus}
              type={type}
              isVerified={i.isVerified || false}
              isPublic={i.isApproved || false}
              role={i.role}
              pendingEdits={i.pendingEdits}
            />
          ))}
        </div>
      )}
    </>
  );
}

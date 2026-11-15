'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, MapPin, X, SlidersHorizontal } from 'lucide-react';
import { EVENTS_OPEN_FILTERS } from './EventFilters';

export default function EventSearchBar({ initialQuery, initialLocation }: { initialQuery?: string; initialLocation?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery ?? searchParams.get('q') ?? '');
  const [location, setLocation] = useState(initialLocation ?? searchParams.get('location') ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const pushSearch = useCallback((q: string, loc: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set('q', q.trim());
    else params.delete('q');
    if (loc.trim()) params.set('location', loc.trim());
    else params.delete('location');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushSearch(val, location), 400);
  };

  const handleLocationChange = (val: string) => {
    setLocation(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushSearch(query, val), 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout(debounceRef.current);
    pushSearch(query, location);
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Phones: the filter button lives here, in the sticky bar, so it's always one flick away (it opens EventFilters' sheet).
  const tf = searchParams.get('timeframe');
  const filterCount = [searchParams.get('category'), searchParams.get('format'), tf && tf !== 'upcoming' ? tf : null].filter(Boolean).length;
  const sorted = !!searchParams.get('sort');

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 sm:rounded-lg sm:border sm:border-gray-200 dark:sm:border-gray-700 sm:bg-white dark:sm:bg-gray-900 sm:p-2">
      <div className="relative flex-1 min-w-0 rounded-md bg-white sm:bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 sm:border-0 overflow-hidden">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search events, topics or organizers..."
          enterKeyHint="search"
          className="w-full h-10 sm:h-auto pl-10 pr-8 sm:py-3 text-base sm:text-sm placeholder:text-[14px] sm:placeholder:text-sm font-jakarta bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => handleQueryChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
      <div className="relative hidden sm:block rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden sm:w-56">
        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={location}
          onChange={(e) => handleLocationChange(e.target.value)}
          placeholder="City or Online"
          className="w-full pl-10 pr-8 py-3 text-sm font-jakarta bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
        />
        {location && (
          <button type="button" onClick={() => handleLocationChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENTS_OPEN_FILTERS))}
        aria-haspopup="dialog"
        aria-label={filterCount > 0 ? `Filters, ${filterCount} on` : 'Filters'}
        className={`lg:hidden relative shrink-0 w-10 h-10 flex items-center justify-center rounded-md border transition-colors duration-200 active:scale-95 motion-reduce:active:scale-100 ${
          filterCount > 0 || sorted
            ? 'border-brand bg-brand/5 text-brand'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden />
        {filterCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-brand text-white text-xs font-bold rounded-full">{filterCount}</span>}
      </button>
      <button
        type="submit"
        className="order-last sm:order-none w-full sm:w-auto shrink-0 h-11 sm:h-auto px-4 sm:px-6 sm:py-3 rounded-md bg-brand text-white font-sora font-bold text-sm hover:bg-brand/90 active:scale-[0.98] sm:active:scale-100 transition-transform motion-reduce:transition-none"
      >
        {/* Phones: its own full-width row under search and filters */}
        Search events
      </button>
    </form>
  );
}

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { MapPin, Search, X } from 'lucide-react';

export default function JobSearchBar({ initialQuery, initialLocation }: { initialQuery?: string; initialLocation?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery || '');
  const [location, setLocation] = useState(initialLocation || '');
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

  const handleClear = () => {
    setQuery('');
    setLocation('');
    clearTimeout(debounceRef.current);
    pushSearch('', '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout(debounceRef.current);
    pushSearch(query, location);
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const hasInput = query.trim() || location.trim();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:gap-0">
      <div className="relative flex-1 sm:rounded-l-xl sm:rounded-r-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-brand/20 transition-all">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Job title, skill or company"
          className="w-full pl-10 pr-8 py-3 text-sm font-jakarta bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => handleQueryChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
      <div className="relative hidden sm:block sm:border-y sm:border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden sm:border-l-0 focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-brand/20 transition-all">
        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={location}
          onChange={(e) => handleLocationChange(e.target.value)}
          placeholder="City or Remote"
          className="w-full sm:w-48 pl-10 pr-8 py-3 text-sm font-jakarta bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
        />
        {location && (
          <button type="button" onClick={() => handleLocationChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
      <button
        type="submit"
        className="px-6 py-3 sm:rounded-r-xl sm:rounded-l-none rounded-xl bg-brand text-white font-sora font-bold text-sm hover:bg-brand/90 transition-colors shrink-0"
      >
        Search
      </button>
    </form>
  );
}

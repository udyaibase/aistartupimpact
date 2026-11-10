'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, Loader2 } from 'lucide-react';
import EventFilters, { EventSortDropdown } from '@/components/events/EventFilters';
import EventListClient from '@/components/events/EventListClient';
import { EVENT_SEARCH_KEYS } from '@/lib/events/search-keys';

type EventRow = Parameters<typeof EventListClient>[0]['events'][number];

/**
 * Reports the URL's event filters. Kept in its own Suspense boundary: useSearchParams makes Next leave a
 * component out of the cached HTML, and the list must stay in it.
 */
function UrlFilters({ onChange }: { onChange: (query: string) => void }) {
  const searchParams = useSearchParams();
  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const key of EVENT_SEARCH_KEYS) {
      const v = searchParams.get(key);
      if (v) p.set(key, v);
    }
    return p.toString();
  }, [searchParams]);
  useEffect(() => { onChange(query); }, [query, onChange]);
  return null;
}

/** The /events list. The page is cached without filters; filtered results come from /api/events/search. */
export default function EventsBrowser({ initialEvents, children }: { initialEvents: EventRow[]; children?: React.ReactNode }) {
  const [filters, setFilters] = useState('');
  const [events, setEvents] = useState(initialEvents);
  const [loading, setLoading] = useState(false);
  const onFilters = useCallback((query: string) => setFilters(query), []);
  const current = useMemo(() => new URLSearchParams(filters), [filters]);

  useEffect(() => {
    if (!filters) {
      setEvents(initialEvents);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/events/search?${filters}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => { setEvents(data.events || []); setLoading(false); })
      .catch((err) => {
        if ((err as Error)?.name === 'AbortError') return;
        setEvents([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [filters, initialEvents]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 mt-6">
      <Suspense fallback={null}>
        <UrlFilters onChange={onFilters} />
      </Suspense>
      {/* Filters (desktop sidebar + mobile bar/sheet) */}
      <Suspense fallback={null}>
        <EventFilters
          currentCategory={current.get('category') || undefined}
          currentFormat={current.get('format') || undefined}
          currentTimeframe={current.get('timeframe') || undefined}
          currentSort={current.get('sort') || undefined}
          total={events.length}
        />
      </Suspense>

      <div className="flex-1 min-w-0">
        {/* Count + sort — desktop */}
        <div className="hidden lg:flex items-center justify-between mb-4">
          <p className="font-sora font-bold text-sm text-navy dark:text-white flex items-center gap-2">
            {events.length} <span className="font-normal text-gray-500 dark:text-gray-400 font-jakarta">{events.length === 1 ? 'event' : 'events'}</span>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" aria-label="Loading events" />}
          </p>
          <Suspense fallback={null}>
            <EventSortDropdown currentSort={current.get('sort') || undefined} />
          </Suspense>
        </div>

        <div className={loading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'} aria-busy={loading}>
          {events.length === 0 ? (
            <div className="card p-10 text-center">
              <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">No events found</h2>
              <p className="text-sm text-gray-500 font-jakarta mb-4">
                Try adjusting your filters or search query.
              </p>
            </div>
          ) : (
            <EventListClient key={filters} events={events} total={events.length} />
          )}
        </div>

        {children}
      </div>
    </div>
  );
}

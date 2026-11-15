'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useCallback, useEffect, useTransition } from 'react';
import { X, ChevronDown, Loader2 } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import FilterList, { type FilterRow } from '@/components/ui/FilterList';

/** The filter button sits in the sticky search bar (EventSearchBar) and opens this sheet. */
export const EVENTS_OPEN_FILTERS = 'events:open-filters';

const SORTS = [
  { value: 'soonest', label: 'Soonest first' },
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Recently added' },
];

const CATEGORIES = [
  { value: 'all', label: 'All events' },
  { value: 'CONFERENCE', label: 'Conference' },
  { value: 'HACKATHON', label: 'Hackathon' },
  { value: 'SUMMIT', label: 'Summit' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'MEETUP', label: 'Meetup' },
  { value: 'DEMO_DAY', label: 'Demo Day' },
  { value: 'WEBINAR', label: 'Webinar' },
  { value: 'NETWORKING', label: 'Networking' },
];

const FORMATS = [
  { value: 'all', label: 'Any format' },
  { value: 'IN_PERSON', label: 'In Person' },
  { value: 'VIRTUAL', label: 'Virtual' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const TIMEFRAMES = [
  { value: 'all', label: 'Any time' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'past', label: 'Past' },
];

const DESKTOP_CATS_SHOWN = 6;

interface EventFiltersProps {
  currentCategory?: string;
  currentFormat?: string;
  currentTimeframe?: string;
  currentSort?: string;
  total: number;
}

export default function EventFilters({
  currentCategory, currentFormat, currentTimeframe,
  currentSort, total,
}: EventFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAllCats, setShowAllCats] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [updating, startUpdate] = useTransition();

  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener(EVENTS_OPEN_FILTERS, open);
    return () => window.removeEventListener(EVENTS_OPEN_FILTERS, open);
  }, []);

  const setFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // Time defaults to "upcoming", so "Any time" has to be written out, or it would quietly mean upcoming again.
    if (key === 'timeframe') {
      if (!value || value === 'upcoming') params.delete(key);
      else params.set(key, value);
    } else if (value === 'all' || !value) params.delete(key);
    else params.set(key, value);
    startUpdate(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }, [router, pathname, searchParams]);

  const clearAll = useCallback(() => {
    startUpdate(() => router.push(pathname, { scroll: false }));
  }, [router, pathname]);

  const activeFilterCount = [
    currentCategory && currentCategory !== 'all',
    currentFormat && currentFormat !== 'all',
    currentTimeframe && currentTimeframe !== 'all' && currentTimeframe !== 'upcoming',
  ].filter(Boolean).length;

  const activeFilters: { key: string; label: string }[] = [];
  if (currentCategory && currentCategory !== 'all') {
    activeFilters.push({ key: 'category', label: CATEGORIES.find(c => c.value === currentCategory)?.label || currentCategory });
  }
  if (currentFormat && currentFormat !== 'all') {
    activeFilters.push({ key: 'format', label: FORMATS.find(f => f.value === currentFormat)?.label || currentFormat });
  }
  if (currentTimeframe && currentTimeframe !== 'upcoming') {
    activeFilters.push({ key: 'timeframe', label: TIMEFRAMES.find(t => t.value === currentTimeframe)?.label || currentTimeframe });
  }

  const noAll = (list: { value: string; label: string }[]) => list.map(o => (o.value === 'all' ? { ...o, value: '' } : o));
  const sheetRows: FilterRow[] = [
    { key: 'sort', label: 'Sort by', options: SORTS, value: currentSort || 'soonest', defaultValue: 'soonest', onChange: v => setFilter('sort', v === 'soonest' ? '' : v) },
    { key: 'timeframe', label: 'When', options: TIMEFRAMES, value: currentTimeframe || 'upcoming', defaultValue: 'upcoming', onChange: v => setFilter('timeframe', v) },
    { key: 'category', label: 'Category', options: noAll(CATEGORIES), value: currentCategory && currentCategory !== 'all' ? currentCategory : '', onChange: v => setFilter('category', v) },
    { key: 'format', label: 'Format', options: noAll(FORMATS), value: currentFormat && currentFormat !== 'all' ? currentFormat : '', onChange: v => setFilter('format', v) },
  ];

  const desktopCats = showAllCats ? CATEGORIES : CATEGORIES.slice(0, DESKTOP_CATS_SHOWN);
  const desktopHidden = CATEGORIES.length - DESKTOP_CATS_SHOWN;


  const SECTION = "text-[11px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3";
  const RADIO = "w-4 h-4 accent-gray-900 dark:accent-white border-gray-300 dark:border-gray-600 cursor-pointer";

  return (
    <>
      {/* ─── DESKTOP SIDEBAR ─── */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-[var(--events-filter-top,7rem)] bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 p-5 shadow-sm max-h-[calc(100vh-var(--events-filter-top,7rem)-1rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-sora font-bold text-base text-navy dark:text-white">Filters</h3>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="text-xs font-semibold font-jakarta text-brand hover:underline">
                Clear all
              </button>
            )}
          </div>

          {/* TIMEFRAME */}
          <div className="mb-5">
            <h4 className={SECTION}>When</h4>
            <div className="space-y-2">
              {TIMEFRAMES.map(tf => (
                <label key={tf.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="timeframe" checked={(currentTimeframe || 'upcoming') === tf.value} onChange={() => setFilter('timeframe', tf.value)} className={RADIO} />
                  <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{tf.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* CATEGORY */}
          <div className="mb-5">
            <h4 className={SECTION}>Category</h4>
            <div className="space-y-2">
              {desktopCats.map(cat => (
                <label key={cat.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="category" checked={(currentCategory || 'all') === cat.value} onChange={() => setFilter('category', cat.value)} className={RADIO} />
                  <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{cat.label}</span>
                </label>
              ))}
              {!showAllCats && desktopHidden > 0 && (
                <button onClick={() => setShowAllCats(true)} className="text-sm font-jakarta font-semibold text-navy dark:text-white hover:underline underline-offset-2">
                  Show {desktopHidden} more
                </button>
              )}
            </div>
          </div>

          {/* FORMAT */}
          <div>
            <h4 className={SECTION}>Format</h4>
            <div className="space-y-2">
              {FORMATS.map(fmt => (
                <label key={fmt.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="format" checked={(currentFormat || 'all') === fmt.value} onChange={() => setFilter('format', fmt.value)} className={RADIO} />
                  <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{fmt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE: active filters + count (the Filters button is in the sticky search bar) ─── */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 [&>*]:shrink-0">
            {activeFilters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key, '')}
                aria-label={`Remove filter: ${f.label}`}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[13px] font-jakarta font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              >
                {f.label} <X className="w-3 h-3 text-gray-400" aria-hidden />
              </button>
            ))}
          </div>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 font-jakarta shrink-0">
            <span className="font-semibold text-navy dark:text-white">{total}</span> {total === 1 ? 'event' : 'events'}
          </p>
        </div>

        <BottomSheet
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title="Filters"
          flush
          headerAction={(activeFilterCount > 0 || (currentSort && currentSort !== 'soonest')) ? (
            <button type="button" onClick={clearAll} className="min-h-[44px] px-2 text-sm font-semibold text-brand font-jakarta">Clear all</button>
          ) : null}
          footer={(
            <button type="button" onClick={() => setMobileOpen(false)} className="w-full min-h-[48px] rounded-xl bg-brand text-white font-jakarta font-bold text-[15px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 motion-reduce:transition-none">
              {updating ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Finding events</> : `Show ${total} ${total === 1 ? 'event' : 'events'}`}
            </button>
          )}
        >
          <FilterList sheetOpen={mobileOpen} rows={sheetRows} />
        </BottomSheet>
      </div>
    </>
  );
}

export function EventSortDropdown({ currentSort }: { currentSort?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 dark:text-gray-400 font-jakarta hidden sm:inline">Sort by</span>
      <div className="relative">
        <select
          value={currentSort || 'soonest'}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
            if (e.target.value === 'soonest') params.delete('sort');
            else params.set('sort', e.target.value);
            router.push(`${pathname}?${params.toString()}`, { scroll: false });
          }}
          className="appearance-none pl-3 pr-8 py-1.5 text-sm font-jakarta font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer hover:border-gray-400 transition-colors"
        >
          <option value="soonest">Soonest first</option>
          <option value="popular">Most popular</option>
          <option value="newest">Recently added</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

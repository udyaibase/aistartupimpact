'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';

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
const MOBILE_CATS_SHOWN = 4;

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

  const setFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all' || !value) params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
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

  const desktopCats = showAllCats ? CATEGORIES : CATEGORIES.slice(0, DESKTOP_CATS_SHOWN);
  const desktopHidden = CATEGORIES.length - DESKTOP_CATS_SHOWN;

  const mobileCats = showAllCats ? CATEGORIES.filter(c => c.value !== 'all') : CATEGORIES.filter(c => c.value !== 'all').slice(0, MOBILE_CATS_SHOWN);
  const mobileHidden = CATEGORIES.filter(c => c.value !== 'all').length - MOBILE_CATS_SHOWN;

  const SECTION = "text-[11px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3";
  const RADIO = "w-4 h-4 accent-gray-900 dark:accent-white border-gray-300 dark:border-gray-600 cursor-pointer";

  return (
    <>
      {/* ─── DESKTOP SIDEBAR ─── */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-28 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 p-5 shadow-sm max-h-[calc(100vh-8rem)] overflow-y-auto">
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

      {/* ─── MOBILE: filter row + bottom sheet ─── */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setMobileOpen(o => !o)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-jakarta font-semibold shrink-0 transition-colors',
                activeFilterCount > 0
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              )}
            >
              <SlidersHorizontal className="w-3 h-3" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            {activeFilters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key, '')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-jakarta font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
              >
                {f.label} <X className="w-3 h-3 text-gray-400" />
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta shrink-0">
            <span className="font-bold text-navy dark:text-white">{total}</span> events
          </p>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
            <div className="absolute bottom-16 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl animate-slide-up" style={{ maxHeight: '45vh' }}>
              <button onClick={() => setMobileOpen(false)} className="w-full flex justify-center pt-2.5 pb-1">
                <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              </button>
              <div className="flex items-center justify-between px-4 pb-2">
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white">Filters</h3>
                {activeFilterCount > 0 && (
                  <button onClick={clearAll} className="text-xs font-semibold font-jakarta text-brand">Clear all</button>
                )}
              </div>
              <div className="overflow-y-auto px-4 pb-3" style={{ maxHeight: 'calc(45vh - 5rem)' }}>
                {/* WHEN */}
                <div>
                  <h4 className="text-[10px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">When</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {TIMEFRAMES.map(tf => (
                      <button
                        key={tf.value}
                        onClick={() => setFilter('timeframe', tf.value)}
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-jakarta font-medium transition-colors',
                          (currentTimeframe || 'upcoming') === tf.value
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CATEGORY */}
                <div className="mt-3">
                  <h4 className="text-[10px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Category</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {mobileCats.map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => setFilter('category', cat.value)}
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-jakarta font-medium transition-colors',
                          currentCategory === cat.value
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                    {!showAllCats && mobileHidden > 0 && (
                      <button onClick={() => setShowAllCats(true)} className="px-3 py-1.5 rounded-full text-xs font-jakarta font-medium bg-gray-100 dark:bg-gray-800 text-gray-500">
                        +{mobileHidden} more
                      </button>
                    )}
                  </div>
                </div>

                {/* FORMAT */}
                <div className="mt-3">
                  <h4 className="text-[10px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Format</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMATS.map(fmt => (
                      <button
                        key={fmt.value}
                        onClick={() => setFilter('format', fmt.value)}
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-jakarta font-medium transition-colors',
                          (currentFormat || 'all') === fmt.value
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-4 pb-5 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="w-full py-2.5 rounded-lg bg-brand text-white font-sora font-bold text-xs"
                >
                  Show {total} events
                </button>
              </div>
            </div>
          </div>
        )}
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

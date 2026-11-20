'use client';

import { useRouter, usePathname } from 'next/navigation';
import { JOB_CATEGORIES } from '@/lib/jobs/composer';
import { useState, useCallback, useEffect, useTransition } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import FilterList, { type FilterRow } from '@/components/ui/FilterList';
import { clsx } from 'clsx';
import { X, ChevronDown, Loader2 } from 'lucide-react';

// Every role employers can post under (same list as the job form), so no job is unfindable by filter.
const CATEGORIES = [
  { value: 'all', label: 'All roles' },
  ...JOB_CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => ({ value: c.value, label: c.label })),
  { value: 'OTHER', label: 'Other roles' },
];

const WORK_TYPES = [
  { value: 'all', label: 'Any' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'ONSITE', label: 'On-site' },
];

// Levels by the minimum years a job asks for (same bands as the search and the job cards).
const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry (0–2 yrs)' },
  { value: 'mid', label: 'Mid (2–5 yrs)' },
  { value: 'senior', label: 'Senior (5–8 yrs)' },
  { value: 'lead', label: 'Lead (8+ yrs)' },
];
const LEGACY_LEVEL: Record<string, string> = { '2': 'entry', '5': 'mid', '10': 'senior', '15': 'lead' };
const levelsOf = (v?: string) => (v ?? '').split(',').map((x) => LEGACY_LEVEL[x.trim()] ?? x.trim()).filter((x) => EXPERIENCE_LEVELS.some((l) => l.value === x));

const DATE_POSTED = [
  { value: 'all', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const DESKTOP_ROLES_SHOWN = 7;

/** The filter button sits in the sticky search bar (JobSearchBar) and opens this sheet. */
export const JOBS_OPEN_FILTERS = 'jobs:open-filters';

const SORT_LABELS = [
  { value: '', label: 'Most recent' },
  { value: 'salary', label: 'Highest salary' },
  { value: 'views', label: 'Most viewed' },
];

interface WorkTypeCount {
  workType: string;
  count: number;
}

interface JobFiltersProps {
  currentCategory?: string;
  currentWorkType?: string;
  currentExperience?: string;
  currentVisa?: string;
  currentSort?: string;
  currentSalaryDisclosed?: string;
  currentDatePosted?: string;
  total: number;
  workTypeCounts?: WorkTypeCount[];
  /** Open jobs per role (all filters aside), for counts beside each role. */
  categoryCounts?: { category: string; count: number }[];
  /** Render only the desktop sidebar or only the mobile filter row (the page puts the row in its sticky search bar). */
  part?: 'desktop' | 'mobile';
}

export default function JobFilters({
  currentCategory, currentWorkType, currentExperience,
  currentVisa, currentSort, total, workTypeCounts = [], categoryCounts = [],
  currentSalaryDisclosed, currentDatePosted, part,
}: JobFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [updating, startUpdate] = useTransition();

  useEffect(() => {
    if (part === 'desktop') return;
    const open = () => setMobileOpen(true);
    window.addEventListener(JOBS_OPEN_FILTERS, open);
    return () => window.removeEventListener(JOBS_OPEN_FILTERS, open);
  }, [part]);

  // The URL is read when a filter is clicked, not during render: useSearchParams would keep the filters out of
  // the cached /jobs HTML.
  const setFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startUpdate(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }, [router, pathname]);

  const clearAll = useCallback(() => {
    startUpdate(() => router.push(pathname, { scroll: false }));
  }, [router, pathname]);

  const activeFilterCount = [
    currentCategory && currentCategory !== 'all',
    currentWorkType && currentWorkType !== 'all',
    currentExperience,
    currentVisa === 'true',
    currentSalaryDisclosed === 'true',
    currentDatePosted && currentDatePosted !== 'all',
  ].filter(Boolean).length;

  const activeFilters: { key: string; label: string }[] = [];
  if (currentWorkType && currentWorkType !== 'all') {
    activeFilters.push({ key: 'workType', label: WORK_TYPES.find(w => w.value === currentWorkType)?.label || currentWorkType });
  }
  if (currentCategory && currentCategory !== 'all') {
    activeFilters.push({ key: 'category', label: CATEGORIES.find(c => c.value === currentCategory)?.label || currentCategory });
  }
  const levels = levelsOf(currentExperience);
  if (levels.length) {
    activeFilters.push({ key: 'experience', label: levels.map((l) => EXPERIENCE_LEVELS.find((e) => e.value === l)!.label.split(' (')[0]).join(', ') });
  }
  const toggleLevel = (value: string) => {
    const next = levels.includes(value) ? levels.filter((l) => l !== value) : [...levels, value];
    // Keep the URL in the list's order so the same choice always reads the same.
    setFilter('experience', EXPERIENCE_LEVELS.map((l) => l.value).filter((v) => next.includes(v)).join(','));
  };

  // Counts are for all open jobs (the other filters aside), so "Any" is everything, not the current result.
  const allOpen = workTypeCounts.reduce((n, w) => n + w.count, 0);
  const getWorkTypeCount = (value: string) => {
    if (value === 'all') return allOpen;
    return workTypeCounts.find(w => w.workType === value)?.count || 0;
  };
  const roleCount = (value: string) => (value === 'all' ? allOpen : categoryCounts.find((c) => c.category === value)?.count || 0);
  // Roles with jobs first (most first), then the rest in their usual order; the selected role always shows.
  const rankedRoles = [
    CATEGORIES[0],
    // "Other roles" is a catch-all: it goes last among the roles with jobs.
    ...CATEGORIES.slice(1).filter((c) => roleCount(c.value) > 0).sort((a, b) => Number(a.value === 'OTHER') - Number(b.value === 'OTHER') || roleCount(b.value) - roleCount(a.value)),
    // Roles nobody is hiring for are left out (they were 33 dead ends behind "Show more"), except the one in use.
    // Without counts (they failed to load) every role stays, so the filter still works.
    ...CATEGORIES.slice(1).filter((c) => roleCount(c.value) === 0 && (!categoryCounts.length || c.value === currentCategory)),
  ];
  const withJobs = rankedRoles.filter((c, i) => i === 0 || roleCount(c.value) > 0).length;
  const shown = categoryCounts.length ? withJobs : DESKTOP_ROLES_SHOWN;
  const desktopCategories = showAllRoles ? rankedRoles : rankedRoles.filter((c, i) => i < shown || c.value === currentCategory);
  const desktopHiddenCount = rankedRoles.length - desktopCategories.length;

  // The phone sheet: 'all' in the lists means no filter, which the shared list writes as ''.
  const noAll = (list: { value: string; label: string }[]) => list.map(o => (o.value === 'all' ? { ...o, value: '' } : o));
  const sheetRows: FilterRow[] = [
    { key: 'sort', label: 'Sort by', options: SORT_LABELS, value: currentSort && currentSort !== 'recent' ? currentSort : '', onChange: v => setFilter('sort', v), emptyLabel: 'Most recent' },
    { key: 'workType', label: 'Work mode', options: noAll(WORK_TYPES.map(w => (w.value === 'all' ? w : { ...w, label: `${w.label} (${getWorkTypeCount(w.value)})` }))), value: currentWorkType && currentWorkType !== 'all' ? currentWorkType : '', onChange: v => setFilter('workType', v) },
    { key: 'category', label: 'Role', options: noAll(rankedRoles.map((c) => (c.value === 'all' ? c : { ...c, label: `${c.label} (${roleCount(c.value)})` }))), value: currentCategory && currentCategory !== 'all' ? currentCategory : '', onChange: v => setFilter('category', v) },
    { key: 'experience', label: 'Experience', options: [{ value: '', label: 'Any' }, ...EXPERIENCE_LEVELS], value: levels.length === 1 ? levels[0] : '', onChange: v => setFilter('experience', v) },
    { key: 'datePosted', label: 'Date posted', options: noAll(DATE_POSTED), value: currentDatePosted && currentDatePosted !== 'all' ? currentDatePosted : '', onChange: v => setFilter('datePosted', v) },
    { kind: 'toggle', key: 'visa', label: 'Visa sponsorship', checked: currentVisa === 'true', onChange: v => setFilter('visa', v ? 'true' : '') },
    { kind: 'toggle', key: 'salaryDisclosed', label: 'Salary disclosed', checked: currentSalaryDisclosed === 'true', onChange: v => setFilter('salaryDisclosed', v ? 'true' : '') },
  ];

  const SECTION = "text-[11px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3";
  const RADIO = "w-4 h-4 accent-gray-900 dark:accent-white border-gray-300 dark:border-gray-600 cursor-pointer";
  const CHECK = "w-4 h-4 rounded accent-gray-900 dark:accent-white border-gray-300 dark:border-gray-600 cursor-pointer";

  return (
    <>
      {/* ─── DESKTOP SIDEBAR ─── sticks just below the sticky search bar (its bottom is --jobs-filter-top) */}
      {part !== 'mobile' && (
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-[var(--jobs-filter-top,7rem)] bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 p-5 shadow-sm max-h-[calc(100vh-var(--jobs-filter-top,7rem)-1rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-sora font-bold text-base text-navy dark:text-white">Filters</h3>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="text-xs font-semibold font-jakarta text-brand hover:underline">
                Clear all
              </button>
            )}
          </div>

          {/* WORK MODE */}
          <div className="mb-5">
            <h4 className={SECTION}>Work Mode</h4>
            <div className="space-y-2">
              {WORK_TYPES.map(wt => (
                <label key={wt.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="workType" checked={(currentWorkType || 'all') === wt.value} onChange={() => setFilter('workType', wt.value)} className={RADIO} />
                  <span className="flex-1 text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{wt.label}</span>
                  <span className="text-xs font-jakarta text-gray-400 dark:text-gray-500 tabular-nums">{getWorkTypeCount(wt.value)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ROLE */}
          <div className="mb-5">
            <h4 className={SECTION}>Role</h4>
            <div className="space-y-2">
              {desktopCategories.map(cat => (
                <label key={cat.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="category" checked={(currentCategory || 'all') === cat.value} onChange={() => setFilter('category', cat.value)} className={RADIO} />
                  <span className="flex-1 text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{cat.label}</span>
                  <span className="text-xs font-jakarta text-gray-400 dark:text-gray-500 tabular-nums">{roleCount(cat.value)}</span>
                </label>
              ))}
              {!showAllRoles && desktopHiddenCount > 0 && (
                <button onClick={() => setShowAllRoles(true)} className="text-sm font-jakarta font-semibold text-navy dark:text-white hover:underline underline-offset-2">
                  Show {desktopHiddenCount} more {desktopHiddenCount === 1 ? 'role' : 'roles'}
                </button>
              )}
            </div>
          </div>

          {/* EXPERIENCE */}
          <div className="mb-5">
            <h4 className={SECTION}>Experience</h4>
            <div className="space-y-2">
              {EXPERIENCE_LEVELS.map(exp => (
                <label key={exp.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={levels.includes(exp.value)} onChange={() => toggleLevel(exp.value)} className={CHECK} />
                  <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{exp.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* MORE */}
          <div className="mb-5">
            <h4 className={SECTION}>More</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={currentVisa === 'true'} onChange={(e) => setFilter('visa', e.target.checked ? 'true' : '')} className={CHECK} />
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">Offers visa sponsorship</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={currentSalaryDisclosed === 'true'} onChange={(e) => setFilter('salaryDisclosed', e.target.checked ? 'true' : '')} className={CHECK} />
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">Salary disclosed</span>
              </label>
            </div>
          </div>

          {/* DATE POSTED — dropdown */}
          <div>
            <h4 className={SECTION}>Date posted</h4>
            <div className="relative">
              <select
                value={currentDatePosted || 'all'}
                onChange={(e) => setFilter('datePosted', e.target.value)}
                className="appearance-none w-full pl-3 pr-8 py-2 text-sm font-jakarta font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 cursor-pointer hover:border-gray-400 transition-colors"
              >
                {DATE_POSTED.map(dp => (
                  <option key={dp.value} value={dp.value}>{dp.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </aside>

      )}

      {/* ─── MOBILE: single row with filter + count + sort, plus bottom sheet ─── */}
      {part !== 'desktop' && (
      <div className="lg:hidden">
        {/* Combined filter + count + sort row */}
        <div className="flex items-center justify-between gap-2">
          {/* The Filters button is beside the search box (JobSearchBar); this row keeps the active filters and the count. */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {activeFilters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key, '')}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[13px] font-jakarta font-medium shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
              >
                {f.label} <X className="w-3 h-3 text-gray-400" />
              </button>
            ))}
          </div>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 font-jakarta shrink-0">
            <span className="font-semibold text-navy dark:text-white">{total}</span> {total === 1 ? 'job' : 'jobs'}
          </p>
        </div>

        <BottomSheet
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title="Filters"
          flush
          headerAction={(activeFilterCount > 0 || (currentSort && currentSort !== 'recent')) ? (
            <button type="button" onClick={clearAll} className="min-h-[44px] px-2 text-sm font-semibold text-brand font-jakarta">Clear all</button>
          ) : null}
          footer={(
            <button type="button" onClick={() => setMobileOpen(false)} className="w-full min-h-[48px] rounded-xl bg-brand text-white font-jakarta font-bold text-[15px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 motion-reduce:transition-none">
              {updating ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Finding jobs</> : `Show ${total} ${total === 1 ? 'job' : 'jobs'}`}
            </button>
          )}
        >
          {/* Phones have no room for the location box beside the search, so it lives here. */}
          <form
            onSubmit={(e) => { e.preventDefault(); setFilter('location', String(new FormData(e.currentTarget).get('location') ?? '').trim()); }}
            className="px-4 pt-4 pb-1 font-jakarta"
          >
            <label htmlFor="jobs-sheet-location" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">City or Remote</label>
            <div className="flex gap-2">
              <input
                id="jobs-sheet-location" name="location" type="text" enterKeyHint="search" autoComplete="address-level2"
                // Read when the sheet opens (not during render, like the other filters), so it shows the current choice.
                key={mobileOpen ? 'open' : 'closed'}
                defaultValue={mobileOpen && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('location') ?? '' : ''}
                placeholder="e.g. Bengaluru"
                className="flex-1 min-w-0 h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-base text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button type="submit" className="shrink-0 h-11 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-900 dark:text-white">Apply</button>
            </div>
          </form>
          <FilterList sheetOpen={mobileOpen} rows={sheetRows} />
        </BottomSheet>
      </div>
      )}
    </>
  );
}

export function SortDropdown({ currentSort }: { currentSort?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 dark:text-gray-400 font-jakarta hidden sm:inline">Sort by</span>
      <div className="relative">
        <select
          value={currentSort || 'recent'}
          onChange={(e) => {
            const params = new URLSearchParams(window.location.search);
            if (e.target.value === 'recent') params.delete('sort');
            else params.set('sort', e.target.value);
            router.push(`${pathname}?${params.toString()}`, { scroll: false });
          }}
          className="appearance-none pl-3 pr-8 py-1.5 text-sm font-jakarta font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer hover:border-gray-400 transition-colors"
        >
          <option value="recent">Most recent</option>
          <option value="salary">Highest salary</option>
          <option value="views">Most viewed</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

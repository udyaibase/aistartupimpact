'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useCallback, useTransition } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import FilterList, { type FilterRow } from '@/components/ui/FilterList';
import { clsx } from 'clsx';
import { SlidersHorizontal, X, ChevronDown, Loader2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'All roles' },
  { value: 'AI_ENGINEER', label: 'AI Engineer' },
  { value: 'ML_ENGINEER', label: 'ML Engineer' },
  { value: 'LLM_ENGINEER', label: 'LLM Engineer' },
  { value: 'DATA_SCIENTIST', label: 'Data Scientist' },
  { value: 'AI_RESEARCH_SCIENTIST', label: 'Research' },
  { value: 'AI_INFRASTRUCTURE', label: 'Infra / MLOps' },
  { value: 'AI_PRODUCT_MANAGER', label: 'Product Manager' },
  { value: 'PROMPT_ENGINEER', label: 'Prompt Engineer' },
  { value: 'NLP_ENGINEER', label: 'NLP' },
  { value: 'COMPUTER_VISION', label: 'Computer Vision' },
];

const WORK_TYPES = [
  { value: 'all', label: 'Any' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'ONSITE', label: 'On-site' },
];

const EXPERIENCE_LEVELS = [
  { value: '2', label: 'Entry (0–2 yrs)' },
  { value: '5', label: 'Mid (2–5 yrs)' },
  { value: '10', label: 'Senior (5+ yrs)' },
  { value: '15', label: 'Lead / Principal' },
];

const DATE_POSTED = [
  { value: 'all', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const DESKTOP_ROLES_SHOWN = 7;

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
  /** Render only the desktop sidebar or only the mobile filter row (the page puts the row in its sticky search bar). */
  part?: 'desktop' | 'mobile';
}

export default function JobFilters({
  currentCategory, currentWorkType, currentExperience,
  currentVisa, currentSort, total, workTypeCounts = [],
  currentSalaryDisclosed, currentDatePosted, part,
}: JobFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [updating, startUpdate] = useTransition();

  const setFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startUpdate(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }, [router, pathname, searchParams]);

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
  if (currentExperience) {
    activeFilters.push({ key: 'experience', label: EXPERIENCE_LEVELS.find(e => e.value === currentExperience)?.label || currentExperience });
  }

  const getWorkTypeCount = (value: string) => {
    if (value === 'all') return total;
    return workTypeCounts.find(w => w.workType === value)?.count || 0;
  };

  const desktopCategories = showAllRoles ? CATEGORIES : CATEGORIES.slice(0, DESKTOP_ROLES_SHOWN);
  const desktopHiddenCount = CATEGORIES.length - DESKTOP_ROLES_SHOWN;

  // The phone sheet: 'all' in the lists means no filter, which the shared list writes as ''.
  const noAll = (list: { value: string; label: string }[]) => list.map(o => (o.value === 'all' ? { ...o, value: '' } : o));
  const sheetRows: FilterRow[] = [
    { key: 'sort', label: 'Sort by', options: SORT_LABELS, value: currentSort && currentSort !== 'recent' ? currentSort : '', onChange: v => setFilter('sort', v), emptyLabel: 'Most recent' },
    { key: 'workType', label: 'Work mode', options: noAll(WORK_TYPES.map(w => (w.value === 'all' ? w : { ...w, label: `${w.label} (${getWorkTypeCount(w.value)})` }))), value: currentWorkType && currentWorkType !== 'all' ? currentWorkType : '', onChange: v => setFilter('workType', v) },
    { key: 'category', label: 'Role', options: noAll(CATEGORIES), value: currentCategory && currentCategory !== 'all' ? currentCategory : '', onChange: v => setFilter('category', v) },
    { key: 'experience', label: 'Experience', options: [{ value: '', label: 'Any' }, ...EXPERIENCE_LEVELS], value: currentExperience ?? '', onChange: v => setFilter('experience', v) },
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
                  <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{cat.label}</span>
                </label>
              ))}
              {!showAllRoles && desktopHiddenCount > 0 && (
                <button onClick={() => setShowAllRoles(true)} className="text-sm font-jakarta font-semibold text-navy dark:text-white hover:underline underline-offset-2">
                  Show {desktopHiddenCount} more roles
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
                  <input type="checkbox" checked={currentExperience === exp.value} onChange={() => setFilter('experience', currentExperience === exp.value ? '' : exp.value)} className={CHECK} />
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
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setMobileOpen(true)}
              aria-haspopup="dialog"
              className={clsx(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-jakarta font-medium shrink-0 transition-colors duration-200',
                activeFilterCount > 0
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
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
            <span className="font-semibold text-navy dark:text-white">{total > 0 ? `${total}+` : '0'}</span> jobs
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
              {updating ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Finding jobs</> : `Show ${total > 0 ? `${total}+` : 0} ${total === 1 ? 'job' : 'jobs'}`}
            </button>
          )}
        >
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
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 dark:text-gray-400 font-jakarta hidden sm:inline">Sort by</span>
      <div className="relative">
        <select
          value={currentSort || 'recent'}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
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

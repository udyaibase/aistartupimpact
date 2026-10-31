'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';

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
const MOBILE_ROLES_SHOWN = 4;

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
}

export default function JobFilters({
  currentCategory, currentWorkType, currentExperience,
  currentVisa, currentSort, total, workTypeCounts = [],
  currentSalaryDisclosed, currentDatePosted,
}: JobFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const setFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
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

  const mobileCategories = showAllRoles ? CATEGORIES.filter(c => c.value !== 'all') : CATEGORIES.filter(c => c.value !== 'all').slice(0, MOBILE_ROLES_SHOWN);
  const mobileHiddenCount = CATEGORIES.filter(c => c.value !== 'all').length - MOBILE_ROLES_SHOWN;

  const SECTION = "text-[11px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3";
  const RADIO = "w-4 h-4 accent-gray-900 dark:accent-white border-gray-300 dark:border-gray-600 cursor-pointer";
  const CHECK = "w-4 h-4 rounded accent-gray-900 dark:accent-white border-gray-300 dark:border-gray-600 cursor-pointer";

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

      {/* ─── MOBILE: single row with filter + count + sort, plus bottom sheet ─── */}
      <div className="lg:hidden">
        {/* Combined filter + count + sort row */}
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
            <span className="font-bold text-navy dark:text-white">{total > 0 ? `${total}+` : '0'}</span> jobs
          </p>
        </div>

        {/* Compact bottom sheet — ~30% height, jobs visible behind */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
            <div className="absolute bottom-16 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl animate-slide-up" style={{ maxHeight: '45vh' }}>
              {/* Handle — tap to close */}
              <button onClick={() => setMobileOpen(false)} className="w-full flex justify-center pt-2.5 pb-1">
                <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              </button>
              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-2">
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white">Filters</h3>
                {activeFilterCount > 0 && (
                  <button onClick={clearAll} className="text-xs font-semibold font-jakarta text-brand">
                    Clear all
                  </button>
                )}
              </div>
              {/* Scrollable compact content */}
              <div className="overflow-y-auto px-4 pb-3" style={{ maxHeight: 'calc(45vh - 5rem)' }}>
                {/* WORK MODE */}
                <div>
                  <h4 className="text-[10px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Work Mode</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {WORK_TYPES.map(wt => (
                      <button
                        key={wt.value}
                        onClick={() => setFilter('workType', wt.value)}
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-jakarta font-medium transition-colors',
                          (currentWorkType || 'all') === wt.value
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {wt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ROLE */}
                <div className="mt-3">
                  <h4 className="text-[10px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Role</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {mobileCategories.map(cat => (
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
                    {!showAllRoles && mobileHiddenCount > 0 && (
                      <button onClick={() => setShowAllRoles(true)} className="px-3 py-1.5 rounded-full text-xs font-jakarta font-medium bg-gray-100 dark:bg-gray-800 text-gray-500">
                        +{mobileHiddenCount} more
                      </button>
                    )}
                  </div>
                </div>

                {/* EXPERIENCE */}
                <div className="mt-3">
                  <h4 className="text-[10px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Experience</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPERIENCE_LEVELS.map(exp => (
                      <button
                        key={exp.value}
                        onClick={() => setFilter('experience', currentExperience === exp.value ? '' : exp.value)}
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-jakarta font-medium transition-colors',
                          currentExperience === exp.value
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {exp.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* DATE POSTED */}
                <div className="mt-3">
                  <h4 className="text-[10px] font-bold font-jakarta text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Date posted</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_POSTED.map(dp => (
                      <button
                        key={dp.value}
                        onClick={() => setFilter('datePosted', dp.value)}
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-jakarta font-medium transition-colors',
                          (currentDatePosted || 'all') === dp.value
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {dp.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* MORE — checkboxes */}
                <div className="mt-3 space-y-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-jakarta text-gray-700 dark:text-gray-300">Visa sponsorship</span>
                    <input type="checkbox" checked={currentVisa === 'true'} onChange={(e) => setFilter('visa', e.target.checked ? 'true' : '')} className={CHECK} />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-jakarta text-gray-700 dark:text-gray-300">Salary disclosed</span>
                    <input type="checkbox" checked={currentSalaryDisclosed === 'true'} onChange={(e) => setFilter('salaryDisclosed', e.target.checked ? 'true' : '')} className={CHECK} />
                  </label>
                </div>
              </div>
              {/* Apply button */}
              <div className="px-4 pb-5 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="w-full py-2.5 rounded-lg bg-brand text-white font-sora font-bold text-xs"
                >
                  Show {total} jobs
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
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

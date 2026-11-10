'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Briefcase, Loader2 } from 'lucide-react';
import JobFilters, { SortDropdown } from '@/components/jobs/JobFilters';
import JobSearchBar from '@/components/jobs/JobSearchBar';
import JobsStickyBar from '@/components/jobs/JobsStickyBar';
import JobListClient from './JobListClient';
import { JOB_SEARCH_KEYS, JOBS_PAGE_SIZE } from '@/lib/jobs/search-keys';

/**
 * Reports the URL's job filters. Kept in its own Suspense boundary: useSearchParams makes Next leave a
 * component out of the cached HTML, and the list must stay in it.
 */
function UrlFilters({ onChange }: { onChange: (query: string) => void }) {
  const searchParams = useSearchParams();
  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const key of JOB_SEARCH_KEYS) {
      const v = searchParams.get(key);
      if (v) p.set(key, v);
    }
    return p.toString();
  }, [searchParams]);
  useEffect(() => { onChange(query); }, [query, onChange]);
  return null;
}

interface Props {
  initialJobs: any[];
  initialTotal: number;
  workTypeCounts: { workType: string; count: number }[];
  children?: React.ReactNode;
}

/** The /jobs list. The page is cached without filters; filtered pages come from /api/jobs/search. */
export default function JobsBrowser({ initialJobs, initialTotal, workTypeCounts, children }: Props) {
  const [filters, setFilters] = useState('');
  const [jobs, setJobs] = useState(initialJobs);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const onFilters = useCallback((query: string) => setFilters(query), []);
  const current = useMemo(() => new URLSearchParams(filters), [filters]);
  const get = (key: string) => current.get(key) || undefined;

  const fetchPage = useCallback(async (offset: number) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const params = new URLSearchParams(filters);
    params.set('limit', String(JOBS_PAGE_SIZE));
    params.set('offset', String(offset));
    const res = await fetch(`/api/jobs/search?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`job search ${res.status}`);
    return res.json() as Promise<{ jobs: any[]; total: number }>;
  }, [filters]);

  useEffect(() => {
    if (!filters) {
      requestRef.current?.abort();
      setJobs(initialJobs);
      setTotal(initialTotal);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPage(0)
      .then((data) => { setJobs(data.jobs || []); setTotal(data.total ?? 0); setLoading(false); })
      .catch((err) => {
        if ((err as Error)?.name === 'AbortError') return;
        setJobs([]); setTotal(0); setLoading(false);
      });
  }, [filters, fetchPage, initialJobs, initialTotal]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(jobs.length);
      setJobs((prev) => [...prev, ...(data.jobs || [])]);
    } catch {
      // keep what is shown
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, fetchPage, jobs.length]);

  const filterProps = {
    currentCategory: get('category'),
    currentWorkType: get('workType'),
    currentExperience: get('experience'),
    currentVisa: get('visa'),
    currentSort: get('sort'),
    currentSalaryDisclosed: get('salaryDisclosed'),
    currentDatePosted: get('datePosted'),
    total,
    workTypeCounts,
  };

  return (
    <>
      <Suspense fallback={null}>
        <UrlFilters onChange={onFilters} />
      </Suspense>

      {/* Search bar (+ mobile filter row): sticky under the site header */}
      <JobsStickyBar>
        <Suspense fallback={<div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />}>
          <JobSearchBar />
        </Suspense>
        <JobFilters part="mobile" {...filterProps} />
      </JobsStickyBar>

      {/* Main layout: sidebar + jobs */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 mt-3">
        <JobFilters part="desktop" {...filterProps} />

        <div className="flex-1 min-w-0">
          {/* Count + sort — desktop */}
          <div className="hidden lg:flex items-center justify-between mb-4">
            <p className="font-sora font-bold text-sm text-navy dark:text-white flex items-center gap-2">
              {total > 0 ? `${total}+` : '0'} <span className="font-normal text-gray-500 dark:text-gray-400 font-jakarta">{total === 1 ? 'job' : 'jobs'}</span>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" aria-label="Loading jobs" />}
            </p>
            <SortDropdown currentSort={get('sort')} />
          </div>

          <div className={loading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'} aria-busy={loading}>
            {jobs.length === 0 ? (
              <div className="card p-10 text-center">
                <Briefcase className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">No jobs found</h2>
                <p className="text-sm text-gray-500 font-jakarta mb-4">
                  Try adjusting your filters or search query.
                </p>
              </div>
            ) : (
              <JobListClient jobs={jobs} total={total} onLoadMore={loadMore} loadingMore={loadingMore} />
            )}
          </div>

          {children}
        </div>
      </div>
    </>
  );
}

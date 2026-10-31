'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Building2, ExternalLink, Bookmark } from 'lucide-react';
import { clsx } from 'clsx';
import { useUser } from '@/components/UserProvider';

const PAGE_SIZE = 15;

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-red-600',
  'bg-amber-600', 'bg-teal-600', 'bg-pink-600', 'bg-indigo-600',
];

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr + 'Z');
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function getShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'Z');
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function SaveButton({ slug, initialSaved, onToggle }: { slug: string; initialSaved: boolean; onToggle?: (slug: string, saved: boolean) => void }) {
  const { user, signIn } = useUser();
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      signIn(window.location.pathname + window.location.search);
      return;
    }

    setLoading(true);
    const prev = saved;
    setSaved(!saved);

    try {
      const res = await fetch(`/api/jobs/${slug}/save`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSaved(data.saved);
        onToggle?.(slug, data.saved);
      } else {
        setSaved(prev);
      }
    } catch {
      setSaved(prev);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={toggle} disabled={loading} title={saved ? 'Unsave job' : 'Save job'} className="group/save disabled:opacity-50">
      <Bookmark className={clsx('w-4 h-4 transition-colors', saved ? 'text-brand fill-brand' : 'text-gray-300 dark:text-gray-600 group-hover/save:text-gray-500')} />
    </button>
  );
}

function JobCard({ job, isSaved, onToggleSave }: { job: any; isSaved: boolean; onToggleSave: (slug: string, saved: boolean) => void }) {
  const initials = job.companyName
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  const colorIdx = job.companyName.charCodeAt(0) % AVATAR_COLORS.length;
  const bgColor = AVATAR_COLORS[colorIdx];

  const isNew = job.publishedAt && (Date.now() - new Date(job.publishedAt + 'Z').getTime()) < 7 * 24 * 60 * 60 * 1000;

  const expLabel = job.experienceMin != null
    ? job.experienceMin <= 2 ? 'Entry' : job.experienceMin <= 5 ? 'Mid level' : 'Senior'
    : null;

  const formatEmploymentType = (type: string | null) => {
    if (!type) return 'Full-time';
    return type.replace(/_/g, '-').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
  };

  return (
    <Link href={`/jobs/${job.slug}`} className="block card p-4 sm:p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group cursor-pointer">
      <div className="flex gap-3 sm:gap-4">
        {/* Company avatar */}
        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${!job.logoUrl ? bgColor : 'bg-gray-100 dark:bg-gray-800'}`}>
          {job.logoUrl ? (
            <Image src={job.logoUrl} alt={job.companyName} width={48} height={48} sizes="48px" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-sora font-bold text-sm">{initials}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white group-hover:text-brand transition-colors">
                {job.title}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
                {job.companyName}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isNew && (
                <span className="text-[10px] font-bold font-jakarta bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                  New
                </span>
              )}
              <SaveButton slug={job.slug} initialSaved={isSaved} onToggle={onToggleSave} />
            </div>
          </div>

          {/* Meta info - desktop */}
          <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400 font-jakarta">
            {(job.city || job.country) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {job.workType === 'REMOTE' ? 'Anywhere in India' : job.city || job.country}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {job.workType === 'REMOTE' ? 'Remote' : job.workType === 'HYBRID' ? 'Hybrid' : 'On-site'} · {formatEmploymentType(job.employmentType)}
            </span>
            {expLabel && (
              <span className="inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                {expLabel}
              </span>
            )}
            {job.showSalary && job.salaryMin && (
              <span className="inline-flex items-center gap-1">
                ₹ {(job.salaryMin / 100000).toFixed(0)}L–{(job.salaryMax / 100000).toFixed(0)}L
              </span>
            )}
          </div>

          {/* Meta info - mobile */}
          <div className="flex sm:hidden flex-wrap gap-1.5 mt-2">
            <span className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-md">
              {job.workType === 'REMOTE' ? 'Remote' : job.workType === 'HYBRID' ? 'Hybrid' : job.city || 'On-site'}
            </span>
            {expLabel && (
              <span className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-md">
                {expLabel}
              </span>
            )}
            <span className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-md">
              {formatEmploymentType(job.employmentType)}
            </span>
          </div>

          {/* Skills */}
          {job.skills?.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5 mt-2.5">
              {job.skills.slice(0, 5).map((skill: string) => (
                <span key={skill} className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-700">
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Bottom row - mobile */}
          <div className="flex sm:hidden items-center justify-between mt-2.5">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta">
              {job.showSalary && job.salaryMin ? `₹ ${(job.salaryMin / 100000).toFixed(0)}L–${(job.salaryMax / 100000).toFixed(0)}L` : ''}
            </span>
            <span className="text-[11px] font-semibold font-jakarta text-green-600 dark:text-green-400">
              {isNew ? 'New' : ''} · {job.publishedAt ? getShortDate(job.publishedAt) : 'Today'}
            </span>
          </div>

          {/* Bottom row - desktop */}
          <div className="hidden sm:flex items-center justify-between mt-3">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta">
              {job.publishedAt ? `Posted ${getTimeAgo(job.publishedAt)}` : 'Recently'} · Easy apply
            </span>
            <div className="flex items-center gap-2">
              <span
                className="px-5 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 transition-colors"
              >
                View details
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold font-jakarta group-hover:bg-gray-800 dark:group-hover:bg-gray-100 transition-colors"
              >
                Apply <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

interface JobListClientProps {
  jobs: any[];
  total: number;
}

export default function JobListClient({ jobs, total }: JobListClientProps) {
  const { user } = useUser();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [savedSlugs, setSavedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || jobs.length === 0) return;
    const slugs = jobs.map((j: any) => j.slug).join(',');
    fetch(`/api/bookmarks/check?jobSlugs=${encodeURIComponent(slugs)}`)
      .then(r => r.json())
      .then(data => {
        const saved = new Set<string>();
        if (data.saved) {
          Object.keys(data.saved).forEach(key => {
            if (key.startsWith('job-') && data.saved[key]) {
              saved.add(key.replace('job-', ''));
            }
          });
        }
        setSavedSlugs(saved);
      })
      .catch(() => {});
  }, [user, jobs]);

  const handleToggleSave = useCallback((slug: string, saved: boolean) => {
    setSavedSlugs(prev => {
      const next = new Set(prev);
      if (saved) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }, []);

  const visibleJobs = jobs.slice(0, visibleCount);
  const hasMore = visibleCount < jobs.length;

  return (
    <>
      <div className="space-y-3">
        {visibleJobs.map((job: any) => (
          <JobCard key={job.id} job={job} isSaved={savedSlugs.has(job.slug)} onToggleSave={handleToggleSave} />
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            className="px-8 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Show more jobs
          </button>
          <p className="text-xs text-gray-400 font-jakarta mt-2">
            Showing {visibleJobs.length} of {total} jobs
          </p>
        </div>
      )}

      {!hasMore && jobs.length > PAGE_SIZE && (
        <p className="text-center text-xs text-gray-400 font-jakarta mt-6">
          Showing all {jobs.length} jobs
        </p>
      )}
    </>
  );
}

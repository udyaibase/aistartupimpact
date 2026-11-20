'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Building2, CheckCircle2, Bookmark, Loader2, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { useUser } from '@/components/UserProvider';
import { useAppliedJobs, type AppliedJob } from '@/hooks/useAppliedJobs';
import { JOBS_PAGE_SIZE as PAGE_SIZE } from '@/lib/jobs/search-keys';
import { salaryText } from '@/lib/jobs/format';

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-red-600',
  'bg-amber-600', 'bg-teal-600', 'bg-pink-600', 'bg-indigo-600',
];

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr + 'Z');
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const h = Math.floor(diffMs / 3_600_000);
    return h < 1 ? 'just now' : `${h}h ago`;
  }
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
    <button type="button" onClick={toggle} disabled={loading} aria-pressed={saved} aria-label={saved ? 'Saved. Remove from saved jobs' : 'Save job'}
      className="group/save inline-flex items-center justify-center w-11 h-11 -m-3.5 disabled:opacity-50">
      <Bookmark aria-hidden className={clsx('w-4 h-4 transition-colors', saved ? 'text-brand fill-brand' : 'text-gray-300 dark:text-gray-600 group-hover/save:text-gray-500')} />
    </button>
  );
}

const SKILLS_ON_PHONE = 2;
const SKILLS_ON_DESKTOP = 5;

/**
 * A job's top skills as a calm row of outlined chips, with a count of the rest: some jobs list nearly 40. Long names
 * are cut short and shown in full on hover. Phones show fewer, on one line, so a card stays short.
 */
function SkillChips({ skills }: { skills?: string[] | null }) {
  const unique = [...new Map((skills ?? []).map((s) => s.trim()).filter(Boolean).map((s) => [s.toLowerCase(), s])).values()];
  if (unique.length === 0) return null;
  const moreOnPhone = unique.length - SKILLS_ON_PHONE;
  const moreOnDesktop = unique.length - SKILLS_ON_DESKTOP;

  return (
    <ul aria-label="Skills" className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 mt-3">
      {unique.slice(0, SKILLS_ON_DESKTOP).map((skill, i) => (
        <li key={skill} className={`min-w-0 ${i >= SKILLS_ON_PHONE ? 'hidden sm:block' : ''}`}>
          <span title={skill} className="block max-w-[150px] sm:max-w-[190px] truncate rounded-full border border-gray-200/70 dark:border-gray-700/70 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs font-medium leading-none font-jakarta text-gray-700 dark:text-gray-300 transition-colors group-hover:border-gray-300/70 dark:group-hover:border-gray-600/70">
            {skill}
          </span>
        </li>
      ))}
      {moreOnPhone > 0 && <li className="sm:hidden shrink-0 whitespace-nowrap text-xs font-medium font-jakarta text-gray-500 dark:text-gray-400 pl-0.5">+{moreOnPhone} more</li>}
      {moreOnDesktop > 0 && <li className="hidden sm:block whitespace-nowrap text-xs font-medium font-jakarta text-gray-500 dark:text-gray-400 pl-0.5">+{moreOnDesktop} more</li>}
    </ul>
  );
}

function JobCard({ job, isSaved, onToggleSave, applied }: { job: any; isSaved: boolean; onToggleSave: (slug: string, saved: boolean) => void; applied?: AppliedJob }) {
  const initials = job.companyName
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  const colorIdx = job.companyName.charCodeAt(0) % AVATAR_COLORS.length;
  const bgColor = AVATAR_COLORS[colorIdx];

  // "New" for the first 3 days; after that the posted date says enough.
  const isNew = job.publishedAt && (Date.now() - new Date(job.publishedAt + 'Z').getTime()) < 3 * 24 * 60 * 60 * 1000;

  // Same bands as the Experience filter (by the minimum years asked).
  const expLabel = job.experienceMin != null
    ? job.experienceMin < 2 ? 'Entry level' : job.experienceMin < 5 ? 'Mid level' : job.experienceMin < 8 ? 'Senior' : 'Lead'
    : null;

  // Apply starts on the job page: people read the role before applying (both Easy apply and company-site jobs).
  const external = job.applicationType === 'EXTERNAL';

  const formatEmploymentType = (type: string | null) => {
    if (!type) return 'Full-time';
    return type.replace(/_/g, '-').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
  };

  return (
    // The title is the link and stretches over the card (whole card clickable); Save and Apply sit above it as their own controls.
    <article className="relative card p-4 sm:p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group">
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
              <h2 className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white group-hover:text-brand transition-colors">
                <Link href={`/jobs/${job.slug}`} className="after:absolute after:inset-0 after:rounded-[inherit] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand">
                  {job.title}
                </Link>
              </h2>
              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
                {job.companyName}
                {job.companyVerified
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" aria-label="Verified company" />
                  : job.companyChecked && <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-px rounded">Email verified</span>}
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-2 shrink-0">
              {applied ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold font-jakarta bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2 py-0.5 rounded">
                  <CheckCircle2 className="w-3 h-3" aria-hidden /> {applied.withdrawn ? 'Withdrawn' : 'Applied'}
                </span>
              ) : isNew && (
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
            {Number(job.positions) > 1 && (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" aria-hidden />
                {Number(job.positions)} openings
              </span>
            )}
            {job.showSalary && salaryText(job) && (
              <span className="inline-flex items-center gap-1">{salaryText(job)}</span>
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
            {Number(job.positions) > 1 && (
              <span className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-md">
                {Number(job.positions)} openings
              </span>
            )}
          </div>

          <SkillChips skills={job.skills} />

          {/* Bottom row - mobile */}
          <div className="flex sm:hidden items-center justify-between mt-2.5">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta">
              {(job.showSalary && salaryText(job)) || ''}
            </span>
            <span className="text-[11px] font-semibold font-jakarta text-gray-500 dark:text-gray-400">
              {job.publishedAt ? getShortDate(job.publishedAt) : 'Today'}
            </span>
          </div>

          {/* Bottom row - desktop */}
          <div className="hidden sm:flex items-center justify-between mt-3">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta">
              {job.publishedAt ? `Posted ${getTimeAgo(job.publishedAt)}` : 'Recently'} · {external ? 'Applies on company site' : 'Easy apply'}
            </span>
            {applied ? (
              <Link href={`/my-applications/${applied.id}`}
                className="relative z-10 inline-flex items-center gap-1.5 min-h-[40px] px-5 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-semibold font-jakarta hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                View application<span className="sr-only">: {job.title}</span>
              </Link>
            ) : (
            <Link href={`/jobs/${job.slug}`} tabIndex={-1} aria-hidden
              className="relative z-10 inline-flex items-center gap-1.5 min-h-[40px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold font-jakarta hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
              View &amp; apply
            </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

interface JobListClientProps {
  jobs: any[];
  total: number;
  /** Loads the next page; omitted when every matching job is already in `jobs`. */
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export default function JobListClient({ jobs, total, onLoadMore, loadingMore }: JobListClientProps) {
  const { user } = useUser();
  const [savedSlugs, setSavedSlugs] = useState<Set<string>>(new Set());
  const applied = useAppliedJobs();

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

  const hasMore = !!onLoadMore && jobs.length < total;

  return (
    <>
      <div className="space-y-3">
        {jobs.map((job: any) => (
          <JobCard key={job.id} job={job} isSaved={savedSlugs.has(job.slug)} onToggleSave={handleToggleSave} applied={applied.get(job.slug)} />
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            Show more jobs
          </button>
          <p className="text-xs text-gray-400 font-jakarta mt-2">
            Showing {jobs.length} of {total} jobs
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

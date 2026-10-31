'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bookmark, Building2, Wrench, Briefcase, ExternalLink, Star, MapPin, Clock, ArrowUpRight } from 'lucide-react';
import BookmarkButton from '../BookmarkButton';

interface SavedJob {
  savedId: string;
  savedAt: string;
  id: string;
  slug: string;
  title: string;
  workType: string;
  city: string | null;
  country: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  showSalary: boolean;
  publishedAt: string | null;
  companyName: string;
  logoUrl: string | null;
}

interface SavedTool {
  savedId: string;
  savedAt: string;
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logoUrl: string | null;
  pricingModel: string;
  avgRating: number;
  reviewCount: number;
}

interface SavedStartup {
  savedId: string;
  savedAt: string;
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logoUrl: string | null;
  stage: string;
  headquartersCity: string | null;
  isVerified: boolean;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SavedItems() {
  const [activeTab, setActiveTab] = useState<'tools' | 'startups' | 'jobs'>('tools');
  const [tools, setTools] = useState<SavedTool[]>([]);
  const [startups, setStartups] = useState<SavedStartup[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSavedItems();
  }, []);

  const fetchSavedItems = async () => {
    setLoading(true);
    try {
      const [toolsRes, startupsRes, jobsRes] = await Promise.all([
        fetch('/api/bookmarks/tools'),
        fetch('/api/bookmarks/startups'),
        fetch('/api/bookmarks/jobs'),
      ]);

      if (toolsRes.ok) {
        const toolsData = await toolsRes.json();
        setTools(toolsData.tools || []);
      }

      if (startupsRes.ok) {
        const startupsData = await startupsRes.json();
        setStartups(startupsData.startups || []);
      }

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setSavedJobs(jobsData.jobs || []);
      }
    } catch (error) {
      console.error('Error fetching saved items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveJob = async (slug: string) => {
    try {
      const res = await fetch(`/api/jobs/${slug}/save`, { method: 'POST' });
      if (res.ok) {
        setSavedJobs(savedJobs.filter(j => j.slug !== slug));
      }
    } catch {}
  };

  const handleRemove = (type: 'tool' | 'startup', id: string) => {
    if (type === 'tool') {
      setTools(tools.filter(t => t.id !== id));
    } else {
      setStartups(startups.filter(s => s.id !== id));
    }
  };

  const totalCount = tools.length + startups.length + savedJobs.length;

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-6">
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 dark:border-gray-700 border-t-brand"></div>
            <span className="text-sm text-gray-500">Loading saved items...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="saved" className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Bookmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Saved Items
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {totalCount} {totalCount === 1 ? 'item' : 'items'} saved
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-all duration-200 ${
              activeTab === 'tools'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Tools
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === 'tools'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {tools.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('startups')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-all duration-200 ${
              activeTab === 'startups'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Startups
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === 'startups'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {startups.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-all duration-200 ${
              activeTab === 'jobs'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Jobs
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === 'jobs'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {savedJobs.length}
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'tools' && (
          <>
            {tools.length === 0 ? (
              <EmptyState
                icon={<Wrench className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
                title="No saved tools"
                description="Explore and save AI tools to access them quickly later."
                href="/tools"
                linkText="Browse Tools"
              />
            ) : (
              <div className="space-y-2">
                {tools.map((tool) => (
                  <div
                    key={tool.savedId}
                    className="group relative flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150"
                  >
                    {/* Logo */}
                    <Link href={`/tools/${tool.slug}`} className="shrink-0">
                      {tool.logoUrl ? (
                        <img
                          src={tool.logoUrl}
                          alt={tool.name}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30 flex items-center justify-center">
                          <Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                      )}
                    </Link>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/tools/${tool.slug}`}
                          className="font-medium text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                        >
                          {tool.name}
                        </Link>
                        <ArrowUpRight className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {tool.tagline}
                      </p>
                    </div>

                    {/* Meta */}
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      {tool.avgRating > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{tool.avgRating.toFixed(1)}</span>
                        </div>
                      )}
                      <span className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {tool.pricingModel}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(tool.savedAt)}</span>
                      </div>
                    </div>

                    {/* Bookmark Button */}
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <BookmarkButton
                        type="tool"
                        itemId={tool.id}
                        itemName={tool.name}
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'startups' && (
          <>
            {startups.length === 0 ? (
              <EmptyState
                icon={<Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
                title="No saved startups"
                description="Discover and save startups you're interested in."
                href="/startups"
                linkText="Browse Startups"
              />
            ) : (
              <div className="space-y-2">
                {startups.map((startup) => (
                  <div
                    key={startup.savedId}
                    className="group relative flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150"
                  >
                    {/* Logo */}
                    <Link href={`/startups/${startup.slug}`} className="shrink-0">
                      {startup.logoUrl ? (
                        <img
                          src={startup.logoUrl}
                          alt={startup.name}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-100 dark:border-emerald-800/30 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      )}
                    </Link>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/startups/${startup.slug}`}
                          className="font-medium text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                        >
                          {startup.name}
                        </Link>
                        {startup.isVerified && (
                          <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0" title="Verified">
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                        )}
                        <ArrowUpRight className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {startup.tagline}
                      </p>
                    </div>

                    {/* Meta */}
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                        {startup.stage}
                      </span>
                      {startup.headquartersCity && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[80px]">{startup.headquartersCity}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(startup.savedAt)}</span>
                      </div>
                    </div>

                    {/* Bookmark Button */}
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <BookmarkButton
                        type="startup"
                        itemId={startup.id}
                        itemName={startup.name}
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'jobs' && (
          <>
            {savedJobs.length === 0 ? (
              <EmptyState
                icon={<Briefcase className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
                title="No saved jobs"
                description="Save AI jobs you're interested in to access them later."
                href="/jobs"
                linkText="Browse Jobs"
              />
            ) : (
              <div className="space-y-2">
                {savedJobs.map((job) => (
                  <div
                    key={job.savedId}
                    className="group relative flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150"
                  >
                    <Link href={`/jobs/${job.slug}`} className="shrink-0">
                      {job.logoUrl ? (
                        <img
                          src={job.logoUrl}
                          alt={job.companyName}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30 flex items-center justify-center">
                          <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                      )}
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/jobs/${job.slug}`}
                          className="font-medium text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                        >
                          {job.title}
                        </Link>
                        <ArrowUpRight className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {job.companyName}
                      </p>
                    </div>

                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                        {job.workType === 'REMOTE' ? 'Remote' : job.workType === 'HYBRID' ? 'Hybrid' : 'On-site'}
                      </span>
                      {(job.city || job.country) && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[80px]">{job.city || job.country}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(job.savedAt)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveJob(job.slug)}
                      className="shrink-0 p-1.5 rounded-lg text-brand hover:bg-brand/10 transition-colors"
                      title="Unsave job"
                    >
                      <Bookmark className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  href,
  linkText,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  linkText: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-[200px] mb-4">
        {description}
      </p>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
      >
        {linkText}
        <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

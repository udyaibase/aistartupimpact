'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bookmark, Building2, Wrench, Briefcase, ExternalLink, Star, MapPin, Clock, ArrowUpRight, CalendarDays, Newspaper, Video } from 'lucide-react';
import { articlePath } from '@/lib/seo';

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

interface SavedEvent {
  savedId: string;
  savedAt: string;
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  format: string;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  venueName: string | null;
  coverImageUrl: string | null;
}

interface SavedStory {
  savedId: string;
  savedAt: string;
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  type: string;
  coverImage: string | null;
  readTimeMinutes: number;
  publishedAt: string | null;
}

type Tab = 'tools' | 'startups' | 'jobs' | 'events' | 'stories';

const STORY_LABEL: Record<string, string> = { NEWS: 'News', STORY: 'Story', OPINION: 'Opinion' };

function eventWhen(e: SavedEvent) {
  const start = new Date(e.startAt);
  const label = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: start.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined, timeZone: e.timezone || 'Asia/Kolkata' });
  if (e.status === 'CANCELLED') return { label, note: 'Cancelled' };
  if (e.status === 'POSTPONED') return { label, note: 'Postponed' };
  if (new Date(e.endAt) < new Date()) return { label, note: 'Ended' };
  return { label, note: null };
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
  const [activeTab, setActiveTab] = useState<Tab>('tools');
  const [tools, setTools] = useState<SavedTool[]>([]);
  const [startups, setStartups] = useState<SavedStartup[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [stories, setStories] = useState<SavedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const load = async <T,>(url: string, key: string): Promise<T[]> => {
        try {
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data?.[key]) ? data[key] : [];
        } catch { return []; }
      };
      const [t, s, j, e, st] = await Promise.all([
        load<SavedTool>('/api/bookmarks/tools', 'tools'),
        load<SavedStartup>('/api/bookmarks/startups', 'startups'),
        load<SavedJob>('/api/bookmarks/jobs', 'jobs'),
        load<SavedEvent>('/api/bookmarks/events', 'events'),
        load<SavedStory>('/api/bookmarks/stories', 'stories'),
      ]);
      if (cancelled) return;
      setTools(t); setStartups(s); setSavedJobs(j); setEvents(e); setStories(st);
      // Open the first tab that has something in it.
      const first = (([['tools', t], ['startups', s], ['jobs', j], ['events', e], ['stories', st]] as [Tab, unknown[]][]).find(([, list]) => list.length > 0));
      if (first) setActiveTab(first[0]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Unsave from the profile, then drop the row. Jobs use their toggle endpoint.
  const remove = async (tab: Tab, slug: string) => {
    const key = `${tab}:${slug}`;
    if (removing) return;
    setRemoving(key);
    const enc = encodeURIComponent(slug);
    const req: Record<Tab, () => Promise<Response>> = {
      tools: () => fetch(`/api/bookmarks/tools?toolId=${enc}`, { method: 'DELETE' }),
      startups: () => fetch(`/api/bookmarks/startups?startupId=${enc}`, { method: 'DELETE' }),
      jobs: () => fetch(`/api/jobs/${enc}/save`, { method: 'POST' }),
      events: () => fetch(`/api/bookmarks/events?eventSlug=${enc}`, { method: 'DELETE' }),
      stories: () => fetch(`/api/bookmarks/stories?storySlug=${enc}`, { method: 'DELETE' }),
    };
    try {
      const res = await req[tab]();
      if (res.ok) {
        if (tab === 'tools') setTools((l) => l.filter((x) => x.slug !== slug));
        if (tab === 'startups') setStartups((l) => l.filter((x) => x.slug !== slug));
        if (tab === 'jobs') setSavedJobs((l) => l.filter((x) => x.slug !== slug));
        if (tab === 'events') setEvents((l) => l.filter((x) => x.slug !== slug));
        if (tab === 'stories') setStories((l) => l.filter((x) => x.slug !== slug));
      }
    } catch { /* keep the row; the user can try again */ } finally {
      setRemoving(null);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'tools', label: 'Tools', icon: <Wrench className="w-3.5 h-3.5" />, count: tools.length },
    { id: 'startups', label: 'Startups', icon: <Building2 className="w-3.5 h-3.5" />, count: startups.length },
    { id: 'jobs', label: 'Jobs', icon: <Briefcase className="w-3.5 h-3.5" />, count: savedJobs.length },
    { id: 'events', label: 'Events', icon: <CalendarDays className="w-3.5 h-3.5" />, count: events.length },
    { id: 'stories', label: 'Stories', icon: <Newspaper className="w-3.5 h-3.5" />, count: stories.length },
  ];
  const totalCount = tabs.reduce((n, t) => n + t.count, 0);

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

  const unsave = (tab: Tab, slug: string, name: string) => (
    <button
      type="button"
      onClick={() => remove(tab, slug)}
      disabled={removing === `${tab}:${slug}`}
      className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
      title="Remove from saved"
      aria-label={`Remove ${name} from saved`}
    >
      <Bookmark className="w-4 h-4 fill-current" />
    </button>
  );

  return (
    <div id="saved" className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Bookmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Saved Items</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {totalCount} {totalCount === 1 ? 'item' : 'items'} saved
            </p>
          </div>
        </div>

        {/* Tabs: scroll sideways on phones */}
        <div className="-mx-4 sm:mx-0 mt-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="tablist" aria-label="Saved items" className="flex gap-1 mx-4 sm:mx-0 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-max">
            {tabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs whitespace-nowrap transition-all duration-200 ${
                    active
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                    active
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4">
        {activeTab === 'tools' && (
          tools.length === 0 ? (
            <EmptyState
              icon={<Wrench className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
              title="No saved tools"
              description="Explore and save AI tools to access them quickly later."
              href="/tools"
              linkText="Browse Tools"
            />
          ) : (
            <div className="space-y-1">
              {tools.map((tool) => (
                <Row
                  key={tool.savedId}
                  href={`/tools/${tool.slug}`}
                  logo={tool.logoUrl}
                  fallback={<Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                  title={tool.name}
                  subtitle={tool.tagline}
                  meta={<>
                    {tool.avgRating > 0 && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{Number(tool.avgRating).toFixed(1)}
                      </span>
                    )}
                    <span className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{tool.pricingModel}</span>
                  </>}
                  savedAt={tool.savedAt}
                  action={unsave('tools', tool.slug, tool.name)}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'startups' && (
          startups.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
              title="No saved startups"
              description="Discover and save startups you're interested in."
              href="/startups"
              linkText="Browse Startups"
            />
          ) : (
            <div className="space-y-1">
              {startups.map((startup) => (
                <Row
                  key={startup.savedId}
                  href={`/startups/${startup.slug}`}
                  logo={startup.logoUrl}
                  fallback={<Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                  title={startup.name}
                  verified={startup.isVerified}
                  subtitle={startup.tagline}
                  meta={<>
                    {startup.stage && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">{startup.stage}</span>
                    )}
                    {startup.headquartersCity && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="w-3 h-3" /><span className="truncate max-w-[80px]">{startup.headquartersCity}</span>
                      </span>
                    )}
                  </>}
                  savedAt={startup.savedAt}
                  action={unsave('startups', startup.slug, startup.name)}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'jobs' && (
          savedJobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
              title="No saved jobs"
              description="Save AI jobs you're interested in to access them later."
              href="/jobs"
              linkText="Browse Jobs"
            />
          ) : (
            <div className="space-y-1">
              {savedJobs.map((job) => (
                <Row
                  key={job.savedId}
                  href={`/jobs/${job.slug}`}
                  logo={job.logoUrl}
                  fallback={<Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                  title={job.title}
                  subtitle={job.companyName}
                  meta={<>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                      {job.workType === 'REMOTE' ? 'Remote' : job.workType === 'HYBRID' ? 'Hybrid' : 'On-site'}
                    </span>
                    {(job.city || job.country) && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="w-3 h-3" /><span className="truncate max-w-[80px]">{job.city || job.country}</span>
                      </span>
                    )}
                  </>}
                  savedAt={job.savedAt}
                  action={unsave('jobs', job.slug, job.title)}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'events' && (
          events.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
              title="No saved events"
              description="Save events you want to attend and find them here."
              href="/events"
              linkText="Browse Events"
            />
          ) : (
            <div className="space-y-1">
              {events.map((ev) => {
                const when = eventWhen(ev);
                return (
                  <Row
                    key={ev.savedId}
                    href={`/events/${ev.slug}`}
                    logo={ev.coverImageUrl}
                    fallback={<CalendarDays className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
                    title={ev.title}
                    subtitle={
                      <span className="inline-flex items-center gap-1">
                        {when.label}
                        <span aria-hidden>·</span>
                        {ev.format === 'VIRTUAL' ? <><Video className="w-3 h-3" /> Online</> : (ev.venueName || (ev.format === 'HYBRID' ? 'Hybrid' : 'In person'))}
                        {when.note && <span className="ml-1 px-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium">{when.note}</span>}
                      </span>
                    }
                    savedAt={ev.savedAt}
                    action={unsave('events', ev.slug, ev.title)}
                  />
                );
              })}
            </div>
          )
        )}

        {activeTab === 'stories' && (
          stories.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
              title="No saved stories"
              description="Tap the bookmark on any story or news article to read it later."
              href="/news"
              linkText="Browse News"
            />
          ) : (
            <div className="space-y-1">
              {stories.map((story) => (
                <Row
                  key={story.savedId}
                  href={articlePath(story.type, story.slug)}
                  logo={story.coverImage}
                  fallback={<Newspaper className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                  title={story.title}
                  subtitle={`${STORY_LABEL[story.type] || 'Article'} · ${story.readTimeMinutes || 1} min read`}
                  savedAt={story.savedAt}
                  action={unsave('stories', story.slug, story.title)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Row({
  href, logo, fallback, title, verified, subtitle, meta, savedAt, action,
}: {
  href: string;
  logo: string | null;
  fallback: React.ReactNode;
  title: string;
  verified?: boolean;
  subtitle: React.ReactNode;
  meta?: React.ReactNode;
  savedAt: string;
  action: React.ReactNode;
}) {
  return (
    <div className="group relative flex items-center gap-3 p-2.5 sm:p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150">
      <Link href={href} className="shrink-0" tabIndex={-1} aria-hidden>
        {logo ? (
          <img src={logo} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-700" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center">{fallback}</div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Link href={href} className="font-medium text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate">
            {title}
          </Link>
          {verified && (
            <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0" title="Verified">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          <ArrowUpRight className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{subtitle}</p>
      </div>
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        {meta}
        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
          <Clock className="w-3 h-3" />{formatDate(savedAt)}
        </span>
      </div>
      {action}
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

'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import StoryCard, { Byline, FounderBadge, type StoryCardData } from '@/components/stories/StoryCard';
import StoryCover from '@/components/stories/StoryCover';
import { isFounderWritten, storyTopic } from '@/components/stories/storyMeta';

const PAGE_SIZE = 12;

type Source = 'all' | 'founders' | 'editorial';
const SOURCES: { id: Source; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'founders', label: 'By founders' },
  { id: 'editorial', label: 'Editorial' },
];

interface Story extends StoryCardData { isFeatured?: boolean | null }

/**
 * The stories list. Filters live in the address (?from=founders&topic=…&q=…) so a filtered view can be shared
 * and the back button returns to it.
 */
export default function StoriesListClient({ stories, leadSlug }: { stories: Story[]; leadSlug?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const source = (SOURCES.some((s) => s.id === params.get('from')) ? params.get('from') : 'all') as Source;
  const topic = params.get('topic') || 'all';
  const urlQuery = params.get('q') || '';

  // The search box updates the address after a short pause, not on every key.
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => setQuery(urlQuery), [urlQuery]);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const setParams = useCallback((next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all') sp.delete(k); else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setVisible(PAGE_SIZE);
  }, [params, pathname, router]);

  useEffect(() => {
    if (query === urlQuery) return;
    const t = setTimeout(() => setParams({ q: query.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [query, urlQuery, setParams]);

  const bySource = useMemo(() => stories.filter((s) =>
    source === 'all' ? true : source === 'founders' ? isFounderWritten(s) : !isFounderWritten(s)), [stories, source]);

  const topics = useMemo(() => {
    const m = new Map<string, number>();
    bySource.forEach((s) => { const t = storyTopic(s); m.set(t, (m.get(t) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [bySource]);

  const counts = useMemo(() => ({
    all: stories.length,
    founders: stories.filter(isFounderWritten).length,
    editorial: stories.filter((s) => !isFounderWritten(s)).length,
  }), [stories]);

  const q = urlQuery.toLowerCase();
  const filtering = source !== 'all' || topic !== 'all' || q !== '';
  const filtered = useMemo(() => bySource.filter((s) =>
    (topic === 'all' || storyTopic(s) === topic) &&
    (!q || s.title.toLowerCase().includes(q) || (s.excerpt || '').toLowerCase().includes(q) || (s.author?.name || '').toLowerCase().includes(q))
  ), [bySource, topic, q]);

  // The lead story sits on top only on the unfiltered view; filtered views are a plain grid.
  const lead = !filtering ? stories.find((s) => s.slug === leadSlug) || null : null;
  const rest = lead ? filtered.filter((s) => s.slug !== lead.slug) : filtered;
  const shown = rest.slice(0, visible);
  const hasMore = visible < rest.length;

  const clearAll = () => { setQuery(''); router.replace(pathname, { scroll: false }); setVisible(PAGE_SIZE); };

  return (
    <div>
      {/* Who wrote it */}
      <div role="tablist" aria-label="Show stories" className="flex gap-1 rounded-[12px] bg-gray-100 dark:bg-gray-900 p-1">
        {SOURCES.map((s) => {
          const on = source === s.id;
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on}
              onClick={() => setParams({ from: s.id, topic: null })}
              className={`flex-1 min-h-[40px] whitespace-nowrap rounded-[9px] px-2 text-sm font-semibold font-jakarta transition-colors ${on
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
              {s.label} <span className={`tabular-nums ${on ? 'text-gray-400' : 'text-gray-400/80'}`}>{counts[s.id]}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mt-3">
        <label htmlFor="stories-search" className="sr-only">Search stories</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input id="stories-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          inputMode="search" enterKeyHint="search" placeholder="Search by title, founder or topic"
          className="w-full min-h-[44px] rounded-[12px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-10 pr-11 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        {query && (
          <button type="button" onClick={() => { setQuery(''); setParams({ q: null }); }} aria-label="Clear search"
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Topics */}
      {topics.length > 1 && (
        <div className="-mx-4 mt-3 overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2 pb-1" role="group" aria-label="Topics">
            {[{ name: 'all', count: bySource.length }, ...topics].map((t) => {
              const on = topic === t.name;
              return (
                <button key={t.name} type="button" aria-pressed={on} onClick={() => setParams({ topic: t.name })}
                  className={`min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-semibold font-jakarta transition-colors ${on
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700'}`}>
                  {t.name === 'all' ? 'All topics' : t.name} <span className="tabular-nums opacity-60">{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Lead story */}
      {lead && (
        <Link href={`/stories/${lead.slug}`}
          className="group mt-6 grid overflow-hidden rounded-[16px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sm:grid-cols-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <StoryCover src={lead.coverImage || lead.thumbnailImage} title={lead.title} topic={storyTopic(lead)}
            logo={lead.startupLogo} name={lead.startupName || lead.author?.name} priority
            sizes="(max-width: 640px) 100vw, 480px" className="aspect-[16/9] sm:aspect-auto sm:min-h-[260px] sm:col-span-3" />
          <div className="flex flex-col p-4 sm:col-span-2 sm:p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand font-jakarta">{lead.isFeatured ? 'Featured' : 'Latest'}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-jakarta">{storyTopic(lead)}</span>
              {isFounderWritten(lead) && <FounderBadge />}
            </div>
            <h2 className="font-sora text-xl font-extrabold leading-tight text-gray-900 dark:text-white sm:text-2xl group-hover:text-brand transition-colors line-clamp-3">
              {lead.title}
            </h2>
            {lead.excerpt && <p className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-gray-400 font-jakarta line-clamp-3">{lead.excerpt}</p>}
            <div className="mt-auto pt-4"><Byline story={lead} size="md" /></div>
          </div>
        </Link>
      )}

      {/* The rest */}
      <div className="mt-8 mb-1 sm:mb-4 flex items-center justify-between gap-3">
        <h2 className="font-sora text-lg font-bold text-gray-900 dark:text-white">
          {filtering ? 'Results' : 'More stories'}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-jakarta" aria-live="polite">
            {rest.length} {rest.length === 1 ? 'story' : 'stories'}
          </span>
          {filtering && (
            <button type="button" onClick={clearAll} className="min-h-[40px] px-2 text-sm font-semibold text-brand hover:underline font-jakarta">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-gray-300 dark:border-gray-700 px-4 py-14 text-center">
          <p className="text-[15px] text-gray-600 dark:text-gray-300 font-jakarta">No stories match these filters.</p>
          <button type="button" onClick={clearAll} className="mt-3 min-h-[44px] rounded-[10px] px-4 text-sm font-semibold text-brand hover:bg-brand/5">
            Show all stories
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
          {shown.map((s) => <StoryCard key={s.slug} story={s} sizes="(max-width: 640px) 96px, 400px" />)}
        </div>
      )}

      {hasMore && <StoriesInfiniteScrollTrigger onIntersect={() => setVisible((v) => v + PAGE_SIZE)} />}
    </div>
  );
}

function StoriesInfiniteScrollTrigger({ onIntersect }: { onIntersect: () => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onIntersectRef = useRef(onIntersect);
  onIntersectRef.current = onIntersect;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) onIntersectRef.current();
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-6">
      <Loader2 className="h-5 w-5 animate-spin text-brand" aria-label="Loading more stories" />
    </div>
  );
}

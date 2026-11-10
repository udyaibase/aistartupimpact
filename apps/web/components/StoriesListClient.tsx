'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import IntentLink from '@/components/IntentLink';
import Image from 'next/image';
import { Search, X, Loader2 } from 'lucide-react';

const PAGE_SIZE = 12;

interface Story {
  slug: string;
  title: string;
  excerpt?: string;
  thumbnailImage?: string;
  coverImage?: string;
  author?: { name?: string };
  category?: { name?: string };
  publishedAt?: string;
  readTimeMinutes?: number;
}

function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

export default function StoriesListClient({ stories, excludeSlugs = [], children }: { stories: Story[]; excludeSlugs?: string[]; children?: React.ReactNode }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Extract unique categories
  const categories = useMemo(() => {
    const catMap = new Map<string, number>();
    stories.forEach(s => {
      const cat = s.category?.name || 'General';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });
    return Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [stories]);

  // Filter stories. Stories already shown above (e.g. Featured) are skipped in the unfiltered list,
  // but still included when the user searches or picks a category.
  const isFiltering = searchQuery !== '' || selectedCategory !== 'all';
  const filteredStories = useMemo(() => {
    return stories.filter(story => {
      if (!isFiltering && excludeSlugs.includes(story.slug)) return false;
      const matchesSearch = searchQuery === '' ||
        story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (story.excerpt || '').toLowerCase().includes(searchQuery.toLowerCase());

      const storyCat = story.category?.name || 'General';
      const matchesCategory = selectedCategory === 'all' || storyCat === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [stories, searchQuery, selectedCategory, isFiltering, excludeSlugs]);

  const shown = filteredStories.slice(0, visible);
  const hasMore = visible < filteredStories.length;

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setVisible(PAGE_SIZE);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="space-y-5">
      {/* ── Sticky Category Pills ── */}
      <div className="-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => handleCategoryChange('all')}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold font-jakarta transition-all ${
              selectedCategory === 'all'
                ? 'bg-brand text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All ({stories.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => handleCategoryChange(cat.name)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold font-jakarta transition-all ${
                selectedCategory === cat.name
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {cat.name} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      {/* ── Search + Results ── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            inputMode="search" enterKeyHint="search" placeholder="Search stories by title or topic..."
            className="w-full pl-11 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm font-jakarta"
          />
          {searchQuery && (
            <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" aria-label="Clear search">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {(searchQuery || selectedCategory !== 'all') && (
          <div className="flex items-center justify-end">
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setVisible(PAGE_SIZE); }}
              className="text-xs text-brand font-semibold hover:underline font-jakarta"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Children (e.g. Featured section) ── */}
      {children}

      {/* ── All Stories heading ── */}
      <div className="flex items-center justify-between">
        <h2 className="font-sora font-bold text-base sm:text-xl text-gray-900 dark:text-white">All Stories</h2>
        <span className="text-xs text-gray-400 font-jakarta">{filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'}</span>
      </div>

      {/* ── Story List ── */}
      {shown.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 font-jakarta text-sm mb-2">No stories found matching your criteria.</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
            className="text-sm text-brand font-semibold hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700">
          {shown.map((story, idx) => (
            <IntentLink key={story.slug} href={`/stories/${story.slug}`} className={`group block ${idx < shown.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}>
              <div className="bg-gray-50 dark:bg-gray-900 hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 hover:border-l-4 hover:border-l-red-500 flex flex-row items-center p-2.5 sm:p-3 gap-2.5 sm:gap-4">
                {(story.thumbnailImage || story.coverImage) && (
                  <div className="relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 overflow-hidden">
                    <Image
                      src={story.thumbnailImage || story.coverImage!}
                      alt={story.title}
                      fill
                      sizes="(max-width: 640px) 80px, 112px"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                )}
                <div className="flex flex-col flex-1 min-w-0 justify-center">
                  <div className="mb-1 sm:mb-1.5 flex items-center gap-1.5 sm:gap-2">
                    <span className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-500">
                      {story.category?.name || 'Founder Story'}
                    </span>
                    {story.readTimeMinutes && (
                      <span className="text-[10px] sm:text-xs text-gray-400 font-jakarta">{story.readTimeMinutes} min</span>
                    )}
                  </div>
                  <p className="font-sora font-bold text-sm leading-snug sm:text-base sm:leading-tight mb-1 sm:mb-1.5 text-gray-900 dark:text-white group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">
                    {story.title}
                  </p>
                  {story.excerpt && (
                    <p className="text-gray-600 dark:text-gray-400 font-jakarta text-[11px] sm:text-xs leading-relaxed line-clamp-1 sm:line-clamp-2">
                      {story.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-gray-400 font-jakarta mt-1 sm:mt-1.5">
                    {story.author?.name && <><span>{story.author.name}</span><span>·</span></>}
                    {story.publishedAt && <span>{formatDate(story.publishedAt)}</span>}
                  </div>
                </div>
              </div>
            </IntentLink>
          ))}
        </div>
      )}

      {/* ── Infinite Scroll ── */}
      {hasMore && (
        <StoriesInfiniteScrollTrigger onIntersect={() => setVisible(v => v + PAGE_SIZE)} />
      )}
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

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onIntersectRef.current();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-6">
      <Loader2 className="w-5 h-5 text-brand animate-spin" />
    </div>
  );
}

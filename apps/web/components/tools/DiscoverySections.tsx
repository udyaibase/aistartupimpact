'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import IntentLink from '@/components/IntentLink';
import Image from 'next/image';
import { Star, ChevronLeft, ChevronRight, TrendingUp, ThumbsUp, Sparkles } from 'lucide-react';

interface ToolCard {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logoUrl?: string;
  avgRating?: number;
  pricingModel?: string;
  categoryName?: string;
}

interface DiscoverySectionsProps {
  trending: ToolCard[];
  recentlyAdded: ToolCard[];
  editorPicks: ToolCard[];
  mostUpvoted: ToolCard[];
}

export default function DiscoverySections({ trending, recentlyAdded, editorPicks, mostUpvoted }: DiscoverySectionsProps) {
  const hasContent = trending.length > 0 || recentlyAdded.length > 0 || editorPicks.length > 0 || mostUpvoted.length > 0;
  if (!hasContent) return null;

  return (
    <div className="space-y-6 mb-8">
      {trending.length > 0 && (
        <Section title="Trending This Week" badge="Trending" badgeColor="text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400">
          {trending.map((tool, i) => <TrendingCard key={tool.id} tool={tool} rank={i + 1} />)}
        </Section>
      )}

      {mostUpvoted.length > 0 && (
        <Section title="Most Upvoted This Month" badge="Popular" badgeColor="text-brand bg-brand/10 dark:bg-brand/20 dark:text-brand">
          {mostUpvoted.map(tool => <UpvotedCard key={tool.id} tool={tool} />)}
        </Section>
      )}

      {recentlyAdded.length > 0 && (
        <Section title="Recently Added" badge="New" badgeColor="text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400">
          {recentlyAdded.map(tool => <NewCard key={tool.id} tool={tool} />)}
        </Section>
      )}

      {editorPicks.length > 0 && (
        <Section title="Editor's Picks" badge="Pick" badgeColor="text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400">
          {editorPicks.map(tool => <EditorPickCard key={tool.id} tool={tool} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, badge, badgeColor, children }: { title: string; badge: string; badgeColor: string; children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    const wheelHandler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el!.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    if (el) el.addEventListener('wheel', wheelHandler, { passive: false });

    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    const onDown = (e: MouseEvent) => { isDown = true; startX = e.pageX; scrollStart = el!.scrollLeft; el!.style.cursor = 'grabbing'; el!.style.userSelect = 'none'; };
    const onMove = (e: MouseEvent) => { if (!isDown) return; e.preventDefault(); el!.scrollLeft = scrollStart - (e.pageX - startX); };
    const onUp = () => { if (!isDown) return; isDown = false; el!.style.cursor = 'grab'; el!.style.removeProperty('user-select'); };
    if (el) {
      el.style.cursor = 'grab';
      el.addEventListener('mousedown', onDown);
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('mouseleave', onUp);
    }

    return () => {
      el?.removeEventListener('scroll', checkScroll);
      el?.removeEventListener('wheel', wheelHandler);
      el?.removeEventListener('mousedown', onDown);
      el?.removeEventListener('mousemove', onMove);
      el?.removeEventListener('mouseup', onUp);
      el?.removeEventListener('mouseleave', onUp);
      el?.style.removeProperty('cursor');
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-sora font-bold text-sm text-navy dark:text-white">{title}</h2>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="btn-icon w-7 h-7 disabled:opacity-30 disabled:cursor-default"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="btn-icon w-7 h-7 disabled:opacity-30 disabled:cursor-default"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="relative -mx-1">
        <div ref={scrollRef} className="flex gap-2.5 sm:gap-3 overflow-x-auto pt-3 pb-2 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-white dark:from-gray-950 pointer-events-none" />
        )}
      </div>
    </div>
  );
}

function ToolLogo({ tool, size = 24 }: { tool: ToolCard; size?: number }) {
  return (
    <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700">
      {tool.logoUrl ? (
        <Image src={tool.logoUrl} alt={tool.name} className="w-full h-full object-cover" width={32} height={32} sizes="32px" />
      ) : (
        <span className="text-xs font-bold text-brand">{tool.name.charAt(0)}</span>
      )}
    </div>
  );
}

function PricingBadge({ pricing }: { pricing?: string }) {
  if (!pricing) return null;
  const colorClass =
    pricing === 'FREE' || pricing === 'Free'
      ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
      : pricing === 'FREEMIUM' || pricing === 'Freemium'
      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
      : pricing === 'OPEN_SOURCE' || pricing === 'Open Source'
      ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-500';
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${colorClass} uppercase`}>
      {pricing === 'OPEN_SOURCE' ? 'OSS' : pricing}
    </span>
  );
}

function TrendingCard({ tool, rank }: { tool: ToolCard; rank: number }) {
  return (
    <IntentLink
      href={`/tools/${tool.slug}`}
      className="shrink-0 w-44 sm:w-56 p-2.5 sm:p-3 rounded-xl active:scale-[0.97] border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-orange-300 dark:hover:border-orange-700 hover:shadow-sm transition-all group relative"
    >
      <div className="absolute -top-1.5 -left-1 bg-orange-500 text-white text-[10px] font-bold px-1 py-px rounded shadow-sm leading-tight">#{rank}</div>
      <div className="flex items-center gap-2.5 mb-2">
        <ToolLogo tool={tool} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors truncate">{tool.name}</p>
          {tool.categoryName && <p className="text-xs text-gray-400 leading-tight">{tool.categoryName}</p>}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 font-jakarta">{tool.tagline}</p>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-gray-800">
        {tool.avgRating && parseFloat(String(tool.avgRating)) > 0 ? (
          <div className="flex items-center gap-0.5">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">{parseFloat(String(tool.avgRating)).toFixed(1)}</span>
          </div>
        ) : <span />}
        <PricingBadge pricing={tool.pricingModel} />
      </div>
    </IntentLink>
  );
}

function UpvotedCard({ tool }: { tool: ToolCard }) {
  return (
    <IntentLink
      href={`/tools/${tool.slug}`}
      className="shrink-0 w-44 sm:w-56 p-2.5 sm:p-3 rounded-xl active:scale-[0.97] border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-brand/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <ToolLogo tool={tool} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy dark:text-white group-hover:text-brand transition-colors truncate">{tool.name}</p>
          {tool.categoryName && <p className="text-xs text-gray-400 leading-tight">{tool.categoryName}</p>}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 font-jakarta">{tool.tagline}</p>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-gray-800">
        <div className="flex items-center gap-1 text-brand">
          <ThumbsUp className="w-3 h-3" />
          <span className="text-xs font-bold">Upvoted</span>
        </div>
        <PricingBadge pricing={tool.pricingModel} />
      </div>
    </IntentLink>
  );
}

function NewCard({ tool }: { tool: ToolCard }) {
  return (
    <IntentLink
      href={`/tools/${tool.slug}`}
      className="shrink-0 w-44 sm:w-56 p-2.5 sm:p-3 rounded-xl active:scale-[0.97] border border-green-100 dark:border-green-900/30 bg-white dark:bg-gray-900 hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm transition-all group relative"
    >
      <div className="absolute -top-1.5 right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-px rounded shadow-sm leading-tight">NEW</div>
      <div className="flex items-center gap-2.5 mb-2">
        <ToolLogo tool={tool} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors truncate">{tool.name}</p>
          {tool.categoryName && <p className="text-xs text-gray-400 leading-tight">{tool.categoryName}</p>}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 font-jakarta">{tool.tagline}</p>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-gray-800">
        {tool.avgRating && parseFloat(String(tool.avgRating)) > 0 ? (
          <div className="flex items-center gap-0.5">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">{parseFloat(String(tool.avgRating)).toFixed(1)}</span>
          </div>
        ) : <span />}
        <PricingBadge pricing={tool.pricingModel} />
      </div>
    </IntentLink>
  );
}

function EditorPickCard({ tool }: { tool: ToolCard }) {
  return (
    <IntentLink
      href={`/tools/${tool.slug}`}
      className="shrink-0 w-44 sm:w-56 p-2.5 sm:p-3 rounded-xl active:scale-[0.97] border border-purple-100 dark:border-purple-900/30 bg-gradient-to-br from-white to-purple-50/50 dark:from-gray-900 dark:to-purple-950/20 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <ToolLogo tool={tool} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">{tool.name}</p>
          {tool.categoryName && <p className="text-xs text-gray-400 leading-tight">{tool.categoryName}</p>}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 font-jakarta">{tool.tagline}</p>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-purple-100/50 dark:border-gray-800">
        <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
          <Sparkles className="w-3 h-3" />
          <span className="text-xs font-bold">Editor Pick</span>
        </div>
        <PricingBadge pricing={tool.pricingModel} />
      </div>
    </IntentLink>
  );
}

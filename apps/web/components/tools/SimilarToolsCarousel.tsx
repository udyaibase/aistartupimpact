'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ChevronLeft, ChevronRight, Wrench } from 'lucide-react';

interface SimilarTool {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logoUrl: string | null;
  avgRating: string | null;
  pricingModel: string;
  websiteUrl: string;
  categoryName: string;
  categorySlug?: string;
  matchType?: string;
}

interface Props {
  tools: SimilarTool[];
  categoryName?: string;
  categorySlug?: string;
}

const PRICING_COLORS: Record<string, string> = {
  FREE: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  FREEMIUM: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400',
  PAID: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  ENTERPRISE: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
};

export default function SimilarToolsCarousel({ tools, categoryName, categorySlug }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!tools?.length) return null;

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -440 : 440, behavior: 'smooth' });
  };

  return (
    <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-sora font-bold text-base sm:text-xl text-navy dark:text-white">Similar tools</h2>
          <p className="text-xs text-gray-400 font-jakarta mt-0.5">
            {categoryName ? `More ${categoryName} tools you might like` : 'Top-rated tools you might like'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {categorySlug && (
            <Link href={`/tools?category=${categorySlug}`} className="text-xs text-brand font-semibold hover:underline font-jakarta mr-2">
              View all →
            </Link>
          )}
          <button onClick={() => scroll('left')} className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-brand hover:text-brand transition-colors text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scroll('right')} className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-brand hover:text-brand transition-colors text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {tools.map((tool) => {
          const logo = tool.logoUrl;
          const rating = tool.avgRating ? parseFloat(tool.avgRating) : null;
          const pricingColor = PRICING_COLORS[tool.pricingModel?.toUpperCase()] || PRICING_COLORS.PAID;

          return (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              style={{ scrollSnapAlign: 'start', minWidth: '200px', maxWidth: '200px' }}
              className="group flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-brand/40 hover:shadow-lg transition-all duration-200 shrink-0"
            >
              {/* Logo + rating row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-11 h-11 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm shrink-0">
                  {logo
                    ? <Image src={logo} alt={tool.name} className="w-full h-full object-cover" width={44} height={44} sizes="44px" />
                    : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-brand">{tool.name.charAt(0).toUpperCase()}</span>}
                </div>
                {rating && rating > 0 && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">{rating.toFixed(1)}</span>
                  </span>
                )}
              </div>

              {/* Name + tagline */}
              <h3 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors line-clamp-1 mb-1">
                {tool.name}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta leading-relaxed line-clamp-2 flex-1 mb-3">
                {tool.tagline}
              </p>

              {/* Pricing badge */}
              <div className="flex items-center justify-between mt-auto">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${pricingColor}`}>
                  {tool.pricingModel}
                </span>
                <span className="text-xs text-gray-400 font-jakarta">{tool.categoryName}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

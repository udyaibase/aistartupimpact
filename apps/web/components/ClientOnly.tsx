'use client';

import dynamic from 'next/dynamic';

export const ScrollToTop = dynamic(() => import('@/components/ScrollToTop'), { ssr: false });
export const AnnouncementBar = dynamic(() => import('@/components/layout/AnnouncementBar'), { ssr: false });
export const FeaturedPartnerRotator = dynamic(() => import('@/components/FeaturedPartnerRotator'), { ssr: false });
export const SponsorStrip = dynamic(() => import('@/components/SponsorStrip'), { ssr: false });
export const HeroCarousel = dynamic(() => import('@/components/HeroCarousel'), {
  ssr: false,
  loading: () => <div className="bg-navy-800 min-h-[340px] sm:min-h-[420px] md:min-h-[500px] animate-pulse" />,
});
// Same footprint as the loaded map (toolbar, map card, sidebar), so the page doesn't jump when it appears.
export const RealIndiaMap = dynamic(() => import('@/components/india-ai/RealIndiaMap'), {
  ssr: false,
  loading: () => (
    <div>
      <div className="mb-6 h-10 w-40 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" aria-hidden="true" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg p-4 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 border border-blue-900/30">
          {/* The real heat map as a light static SVG (edge-cached), so the map shows at once while its code loads. */}
          <div className="w-full aspect-square max-h-[600px] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG from our API, no optimisation needed */}
            <img src="/api/india-ai/map-svg" alt="Map of India showing AI startups by state" width={800} height={800} fetchPriority="high" className="h-full w-auto max-w-full opacity-90" />
          </div>
        </div>
        <div className="hidden lg:block rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    </div>
  ),
});

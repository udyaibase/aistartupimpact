import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, TrendingUp, Star, Users, ChevronRight,
  Sparkles, IndianRupee, Zap, Clock,
  ArrowUpRight, Briefcase, MapPin, Calendar,
} from 'lucide-react';
import { ToolCTAButton } from '@/components/tools/ToolCTAButton';
import HomeCTA from '@/components/HomeCTA';

// ISR: revalidate every 60s — much better than force-dynamic for production
// Hero slots change infrequently; this gives CDN caching + fresh data
export const revalidate = 60;

import {
  getHeroArticleDirect as getHeroArticle,
  getTrendingNewsDirect as getTrendingNews,
  getLatestStoriesDirect as getLatestStories,
  getFounderSpotlightDirect as getFounderSpotlights,
  getIndiaAIEcosystemDirect as getIndiaAIEcosystem,
  getActiveCreativeForZone,
  getActiveLiveTickers,
  getFeaturedStartupDirect as getFeaturedStartup,
  getFundingDigestsDirect,
  getActiveSponsorDirect,
  getActiveSponsorsDirect,
  getActiveHeroSlotsDirect,
  getFeaturedToolsDirect,
  getPriorityToolsDirect,
  getRecentMilestonesDirect,
  getLatestJobsDirect,
  getUpcomingEventsDirect,
} from '@/lib/db';

// Fallbacks in a separate file — keeps this bundle lean
import {
  defaultHeroArticle,
  defaultTrendingItems,
  defaultLatestStories,
  defaultFounderSpotlights,
  defaultToolPicks,
  defaultFundingDigests,
  defaultPremiumStartup,
  defaultSponsor,
  defaultIndiaAI,
} from '@/lib/fallbacks';

// Dynamic imports for heavy client components — reduces initial JS bundle
import { FeaturedPartnerRotator, SponsorStrip, HeroCarousel } from '@/components/ClientOnly';
import ForYouSection from '@/components/ForYouSection';

const formatDate = (isoString: string) =>
  new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ═══════════════════════════════════════════════════════
   HOMEPAGE — Mobile-first + Dark/Light mode
   ═══════════════════════════════════════════════════════ */

export default async function HomePage() {
  // Fetch everything in parallel for maximum performance
  const [
    fetchedHeroArticle,
    fetchedTrending,
    fetchedLatest,
    fetchedSpotlights,
    fetchedTools,
    fetchedFundingDigests,
    fetchedFeaturedStartup,
    fetchedIndiaAI,
    heroAd,
    tickerAd,
    sectionAd,
    fetchedLiveTickers,
    fetchedSponsor,
    fetchedHeroSlots,
    fetchedFeaturedTools,
    fetchedPriorityTools,
    fetchedMilestones,
    fetchedJobs,
    fetchedEvents,
  ] = await Promise.all([
    getHeroArticle(),
    getTrendingNews(),
    getLatestStories(8),
    getFounderSpotlights(8),
    Promise.resolve([]), // toolPicks deprecated locally
    getFundingDigestsDirect(3),
    getFeaturedStartup(),
    getIndiaAIEcosystem(4),
    getActiveCreativeForZone('H1_HERO_FEATURE'),
    getActiveCreativeForZone('H2_TRENDING_STRIP'),
    getActiveCreativeForZone('H3_SECTION_SPONSOR'),
    getActiveLiveTickers(),
    getActiveSponsorsDirect(),
    getActiveHeroSlotsDirect(),
    getFeaturedToolsDirect(),
    getPriorityToolsDirect(12),
    getRecentMilestonesDirect(6),
    getLatestJobsDirect(6),
    getUpcomingEventsDirect(4),
  ]);

  // Use fetched data, but provide elegant fallbacks if DB is empty or backend is unreachable
  const heroArticle = fetchedHeroArticle || defaultHeroArticle;
  const trendingItems = fetchedLiveTickers?.length > 0 ? fetchedLiveTickers : (fetchedTrending?.length > 0 ? fetchedTrending : defaultTrendingItems);
  const latestStories = fetchedLatest?.length > 0 
    ? fetchedLatest 
    : ((fetchedSpotlights && fetchedSpotlights.length > 0) ? fetchedSpotlights : []);
  const founderSpotlights = (fetchedSpotlights && fetchedSpotlights.length > 0) ? fetchedSpotlights : [];
  const toolPicks = fetchedPriorityTools?.length > 0 ? fetchedPriorityTools : defaultToolPicks;
  const hasFunding = fetchedFundingDigests && fetchedFundingDigests.length > 0;
  const fundingDigests = hasFunding ? fetchedFundingDigests : [];

  // Featured partner rotator — only FEATURED tier AiTools, no startup merging
  const featuredPartnersList = fetchedFeaturedTools?.length > 0
    ? fetchedFeaturedTools.map((t: any) => ({
        name: t.name,
        tagline: t.tagline,
        description: t.description,
        ctaUrl: `/tools/${t.slug}`,
        logoUrl: t.logoUrl,
      }))
    : [];
  const indiaAI = fetchedIndiaAI?.length > 0 ? fetchedIndiaAI : defaultIndiaAI;
  const activeSponsors = (fetchedSponsor as any[]) || [];
  // Hero: scheduled slots take priority, fallback to heroAd or featured article as a single slide
  const heroSlides = (fetchedHeroSlots && fetchedHeroSlots.length > 0)
    ? fetchedHeroSlots.map((slot: any) => ({
        id: slot.id,
        title: slot.title,
        excerpt: slot.excerpt ?? null,
        coverImage: slot.coverImage ?? null,
        ctaUrl: slot.ctaUrl,
        ctaLabel: slot.ctaLabel || 'Learn More',
        badgeText: slot.badgeText || 'Featured',
        authorName: slot.authorName ?? null,
        readTimeMinutes: slot.readTimeMinutes ?? null,
      }))
    : heroAd
      ? [{
        id: 'hero-ad',
        title: heroAd.headline,
        excerpt: heroAd.bodyText,
        coverImage: heroAd.imageUrl ?? null,
        ctaUrl: heroAd.ctaUrl,
        ctaLabel: heroAd.ctaText || 'Learn More',
        badgeText: `★ Sponsored · ${heroAd.companyName}`,
        authorName: heroAd.companyName,
        readTimeMinutes: null,
      }]
      : [{
        id: heroArticle.id || 'hero-article',
        title: heroArticle.title,
        excerpt: heroArticle.excerpt ?? null,
        coverImage: heroArticle.coverImage ?? null,
        ctaUrl: heroArticle.type === 'STORY' ? `/stories/${heroArticle.slug}` : `/news/${heroArticle.slug}`,
        ctaLabel: 'Read Story',
        badgeText: heroArticle.category?.name || 'Story',
        authorName: heroArticle.author?.name ?? null,
        readTimeMinutes: heroArticle.readTimeMinutes ?? null,
      }];

  return (
    <>
      {/* ╔════════════════════════════════════════════╗
          ║  1. HERO — Scheduled Carousel / Ad / Article║
          ╚════════════════════════════════════════════╝ */}
      <section>
        <HeroCarousel slides={heroSlides} />
      </section>

      {/* SEO H1 + intro — visually hidden, crawlable by search engines */}
      <div className="sr-only">
        <h1>India&apos;s AI Startup Ecosystem — News, Funding, Tools &amp; Founder Stories</h1>
        <p>
          Udyaibase tracks the pulse of India&apos;s artificial intelligence ecosystem. Discover the latest AI startup launches,
          venture funding rounds, founder interviews, and breakthrough tools shaping the industry. From seed-stage companies in
          Bangalore and Hyderabad to growth-stage firms raising Series A and beyond, we cover every corner of the Indian AI landscape.
        </p>
        <p>
          Whether you&apos;re a founder building the next generative AI product, an investor scouting early-stage opportunities,
          a developer exploring open-source AI tools, or a job seeker looking for roles at fast-growing startups — Udyaibase
          is your single source for actionable intelligence. Browse curated funding digests, compare AI tools side by side,
          register for upcoming events, and read in-depth stories about the people driving India&apos;s AI revolution.
        </p>
      </div>

      {/* ╔════════════════════════════════════════════╗
          ║  2. TRENDING TICKER — Live Strip            ║
          ╚════════════════════════════════════════════╝ */}
      <section className="bg-navy-900 dark:bg-gray-900 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-4 h-10 sm:h-11 overflow-hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-brand" />
              </span>
              <span className="text-brand text-xs sm:text-xs font-bold uppercase tracking-wider font-sora">Live</span>
            </div>
            <div className="overflow-hidden flex-1">
              <div className="animate-ticker whitespace-nowrap flex gap-6 sm:gap-12">
                {tickerAd && (
                  <a href={tickerAd.ctaUrl} target="_blank" rel="noopener noreferrer"
                    className="text-brand text-[13px] sm:text-sm font-jakarta font-semibold inline-flex items-center gap-2 sm:gap-3 hover:underline">
                    <span className="text-yellow-400 font-bold">★ Sponsored</span>
                    {tickerAd.headline}
                  </a>
                )}
                {/* Duplicate items for seamless infinite loop */}
                {[...trendingItems, ...trendingItems].map((item: any, i: number) => (
                  <span key={i} className="text-gray-200 text-[13px] sm:text-sm font-jakarta font-medium inline-flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="text-brand font-bold">•</span>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For You — personalized recommendations (client-side, hidden if no session) */}
      <ForYouSection />

      {/* ╔════════════════════════════════════════════╗
          ║  3. LATEST STORIES — Exact Grid Design     ║
          ╚════════════════════════════════════════════╝ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 cv-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white">Latest Stories</h2>
          </div>
          <Link href="/news" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label="View all news">
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Seamless Grid with extended corner lines */}
        <div className="relative">
          {/* Top-left */}
          <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
          {/* Top-right */}
          <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
          {/* Bottom-left */}
          <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
          {/* Bottom-right */}
          <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />

        <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700">
          {latestStories.slice(0, 8).map((story: any, idx: number, arr: any[]) => {
            const N = arr.length;
            const borderClass = [
              idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
              idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
              idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : ''
            ].filter(Boolean).join(' ');
            return (
              <Link key={story.slug} href={`/news/${story.slug}`} className="group h-full">
                <div className={`bg-gray-50 dark:bg-gray-900 p-5 sm:p-6 relative hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} h-full flex flex-col`}>
                  <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-r-sm" />
                  <div className="mb-3">
                    <span className="inline-block text-xs font-bold uppercase tracking-wider text-red-500">
                      {story.category?.name || 'News'}
                    </span>
                  </div>
                  <p className="font-sora font-bold text-base sm:text-lg text-gray-900 dark:text-white leading-tight mb-3 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">
                    {story.title}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 font-jakarta text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
                    {story.excerpt || ' '}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 font-jakarta mt-auto">
                    {story.author?.name && <><span>{story.author.name}</span><span>·</span></>}
                    <span>{formatDate(story.publishedAt)}</span>
                    {story.readTimeMinutes && <><span>·</span><span>{story.readTimeMinutes} min read</span></>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        </div>
      </section>

      {/* ╔════════════════════════════════════════════╗
          ║  4. SPONSOR STRIP — Native Ad               ║
          ╚════════════════════════════════════════════╝ */}
      {(sectionAd || activeSponsors.length > 0) && (
      <section className="border-y border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {sectionAd ? (
            <a href={sectionAd.ctaUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-3.5 group">
              <span className="text-xs sm:text-xs text-gray-400 font-jakarta uppercase tracking-wider">Sponsored</span>
              <span className="font-sora font-bold text-brand text-xs sm:text-sm group-hover:underline">{sectionAd.companyName}</span>
              <span className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm font-jakarta hidden sm:inline">— {sectionAd.headline}</span>
              <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-brand opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ) : (
            <SponsorStrip sponsors={activeSponsors} />
          )}
        </div>
      </section>
      )}

      {/* ╔════════════════════════════════════════════╗
          ║  5. FOUNDER SPOTLIGHT — Premium Grid        ║
          ╚════════════════════════════════════════════╝ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 cv-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white">Founder Spotlight</h2>
            <span className="inline-flex items-center gap-1 bg-brand/10 text-brand text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full font-jakarta">
              <span className="w-1 h-1 rounded-full bg-brand animate-pulse" />
              Featured
            </span>
          </div>
          <Link href="/stories" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label="View all founder stories">
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Premium seamless 2-col grid */}
        <div className="relative">
          <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700 overflow-hidden">
          {founderSpotlights.slice(0, 8).map((story: any, idx: number, arr: any[]) => {
            const N = arr.length;
            const borderClass = [
              idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
              idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
              idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : ''
            ].filter(Boolean).join(' ');
            return (
              <Link key={story.slug} href={`/stories/${story.slug}`} className="group h-full">
                <div className={`relative bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} flex flex-col h-full`}>
                  {/* Left accent bar on hover */}
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-top rounded-r" />

                  {/* Thumbnail */}
                  <div className="relative h-48 sm:h-64 lg:h-72 bg-gradient-to-br from-brand/10 to-gray-100 dark:from-brand/20 dark:to-gray-800 overflow-hidden shrink-0">
                    {(story.thumbnailImage || story.coverImage) ? (
                      <Image
                        src={story.thumbnailImage || story.coverImage}
                        alt={story.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center">
                          <Users className="w-6 h-6 text-brand/40" />
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3">
                      <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-white bg-brand px-1.5 sm:px-2 py-0.5 rounded-sm">
                        Founder Story
                      </span>
                    </div>
                    {story.readTimeMinutes && (
                      <div className="absolute bottom-3 right-3">
                        <span className="flex items-center gap-1 text-xs text-white/80 font-jakarta bg-black/40 px-1.5 py-0.5 rounded">
                          <Clock className="w-2.5 h-2.5" />
                          {story.readTimeMinutes} min
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5 sm:p-6 flex flex-col flex-1">
                    {/* Title */}
                    <p className="font-sora font-bold text-base sm:text-lg text-gray-900 dark:text-white leading-snug mb-2.5 group-hover:text-brand transition-colors line-clamp-2">
                      {story.title}
                    </p>

                    {/* Excerpt */}
                    {story.excerpt && (
                      <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm leading-relaxed line-clamp-2 mb-4 flex-1">
                        {story.excerpt}
                      </p>
                    )}

                    {/* Author row */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 mt-auto">
                      <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center text-xs text-brand font-bold shrink-0">
                        {story.author?.name?.charAt(0) || 'A'}
                      </div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 font-jakarta">
                        {story.author?.name || 'Editorial'}
                      </span>
                      {story.publishedAt && (
                        <>
                          <span className="text-gray-300 dark:text-gray-600">·</span>
                          <span className="text-xs text-gray-400 font-jakarta">{formatDate(story.publishedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        </div>
      </section>

      {/* Tool Picks moved — see below India AI Ecosystem */}

      {/* ╔════════════════════════════════════════════╗
          ║  7. FUNDING DIGESTS / FOUNDER STORIES       ║
          ╚════════════════════════════════════════════╝ */}
      {(hasFunding || founderSpotlights.length > 0) && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 cv-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            {hasFunding ? (
              <>
                <IndianRupee className="w-5 h-5 sm:w-6 sm:h-6 text-brand" />
                <h2 className="section-title">Funding Digests</h2>
              </>
            ) : (
              <>
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-brand" />
                <h2 className="section-title">Latest Founder Stories</h2>
              </>
            )}
          </div>
          <Link 
            href={hasFunding ? "/funding" : "/stories"} 
            className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label={hasFunding ? "View all funding digests" : "View all founder stories"}
          >
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Seamless grid — same style as India AI Ecosystem */}
        <div className="relative">
          <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="bg-white dark:bg-gray-900 overflow-hidden border border-gray-200 dark:border-gray-700">
          {/* Dark header bar */}
          <div className="bg-gray-900 dark:bg-gray-800 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand shrink-0" />
              <span className="text-white font-bold text-xs sm:text-sm uppercase tracking-wider">
                {hasFunding ? "Weekly Funding Rounds" : "Ecosystem Spotlights"}
              </span>
            </div>
            <div className="bg-gray-800 dark:bg-gray-700 px-2 sm:px-3 py-1 rounded-full shrink-0">
              <span className="text-gray-300 text-xs sm:text-xs font-medium uppercase tracking-wider">
                {hasFunding ? "India AI" : "Founders"}
              </span>
            </div>
          </div>

          {/* 3-col seamless grid */}
          <div className="p-0 bg-gray-50 dark:bg-gray-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {hasFunding ? (
                fundingDigests.slice(0, 3).map((digest: any, idx: number) => {
                  const borderClass = [
                    'border-b sm:border-r border-gray-200 dark:border-gray-700',
                    'border-b sm:border-b-0 sm:border-r lg:border-r border-gray-200 dark:border-gray-700',
                    '',
                  ][idx] || '';
                  return (
                    <Link key={digest.slug} href="/funding" className={`group ${borderClass}`}>
                      <div className="bg-gray-50 dark:bg-gray-800 p-5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 h-full flex flex-col gap-3">
                        {/* Date + badge */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 font-jakarta">
                            {formatDate(digest.date)}
                          </span>
                          <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                            <TrendingUp className="w-2.5 h-2.5" />
                            Weekly
                          </span>
                        </div>

                        {/* Total raised — hero number */}
                        <div>
                          <div className="font-sora font-extrabold text-2xl text-brand leading-none">
                            {digest.totalRaised}
                          </div>
                          <div className="text-xs text-gray-400 font-jakarta mt-0.5">
                            raised across {digest.dealsCount} {digest.dealsCount === 1 ? 'deal' : 'deals'}
                          </div>
                        </div>

                        {/* Title — cleaned up, no "Week X:" prefix */}
                        <p className="font-sora font-semibold text-sm text-gray-900 dark:text-white leading-snug group-hover:text-brand transition-colors line-clamp-2 flex-1">
                          {digest.title.replace(/^Week\s+\d+:\s*/i, '')}
                        </p>

                        {/* Top deals preview */}
                        {digest.deals?.slice(0, 2).map((deal: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs font-jakarta border-t border-gray-200 dark:border-gray-700 pt-2">
                            <span className="text-gray-600 dark:text-gray-300 font-medium truncate">{deal.startup}</span>
                            <span className="text-brand font-bold shrink-0 ml-2">{deal.amount}</span>
                          </div>
                        ))}
                      </div>
                    </Link>
                  );
                })
              ) : (
                founderSpotlights.slice(0, 3).map((story: any, idx: number) => {
                  const borderClass = [
                    'border-b sm:border-r border-gray-200 dark:border-gray-700',
                    'border-b sm:border-b-0 sm:border-r lg:border-r border-gray-200 dark:border-gray-700',
                    '',
                  ][idx] || '';
                  return (
                    <Link key={story.slug} href={`/stories/${story.slug}`} className={`group ${borderClass}`}>
                      <div className="bg-gray-50 dark:bg-gray-800 p-5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 h-full flex flex-col gap-3">
                        {/* Date + badge */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 font-jakarta">
                            {formatDate(story.publishedAt)}
                          </span>
                          <span className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                            Story
                          </span>
                        </div>
                        {/* Title */}
                        <p className="font-sora font-semibold text-sm text-gray-900 dark:text-white leading-snug group-hover:text-brand transition-colors line-clamp-2 flex-1">
                          {story.title}
                        </p>
                        {/* Excerpt */}
                        {story.excerpt && (
                          <p className="text-gray-600 dark:text-gray-400 font-jakarta text-xs leading-relaxed line-clamp-3 mb-2">
                            {story.excerpt}
                          </p>
                        )}
                        {/* Author */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 mt-auto">
                          <div className="w-5 h-5 rounded-full bg-brand/10 flex items-center justify-center text-xs text-brand font-bold shrink-0">
                            {story.author?.name?.charAt(0) || 'A'}
                          </div>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 font-jakarta">
                            {story.author?.name || 'Editorial'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
        </div>
      </section>
      )}

      {/* ╔════════════════════════════════════════════╗
          ║  8. PREMIUM FEATURED PARTNER ROTATOR        ║
          ╚════════════════════════════════════════════╝ */}
      {featuredPartnersList.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 sm:pb-12 mt-8">
          <FeaturedPartnerRotator partners={featuredPartnersList} />
        </section>
      )}

      {/* ╔════════════════════════════════════════════╗
          ║  9. INDIA AI ECOSYSTEM — Redesigned        ║
          ╚════════════════════════════════════════════╝ */}
      <section className="py-8 sm:py-12 cv-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div>
              <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white">India AI Ecosystem</h2>
            </div>
            <Link href="/startups" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label="View all startups">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Main Container with Dark Header */}
          <div className="relative">
            <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="bg-white dark:bg-gray-900 overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Dark Header */}
            <div className="bg-gray-900 dark:bg-gray-800 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-xl sm:text-2xl shrink-0">🇮🇳</span>
                <div className="min-w-0">
                  <span className="text-red-500 font-bold text-xs sm:text-sm uppercase tracking-wider">MADE IN</span>
                  <span className="text-white font-bold text-xs sm:text-sm uppercase tracking-wider ml-1">INDIA</span>
                  <span className="text-gray-400 font-medium text-xs sm:text-sm ml-2 hidden sm:inline">— AI ECOSYSTEM</span>
                </div>
              </div>
              <div className="bg-gray-800 dark:bg-gray-700 px-2 sm:px-3 py-1 rounded-full shrink-0">
                <span className="text-gray-300 text-xs sm:text-xs font-medium uppercase tracking-wider">INDIA-FIRST</span>
              </div>
            </div>

            {/* Content Grid - No Gaps */}
            <div className="p-0 bg-gray-50 dark:bg-gray-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {indiaAI.slice(0, 4).map((item: any, idx: number) => {
                  const borderClass = [
                    'border-b sm:border-r border-gray-200 dark:border-gray-700',
                    'border-b sm:border-b-0 sm:border-r lg:border-r border-gray-200 dark:border-gray-700',
                    'border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-gray-700',
                    '',
                  ][idx] || '';
                  return (
                    <Link key={item.slug} href={`/news/${item.slug}`} className={`group cursor-pointer ${borderClass}`}>
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300">
                        <div className="mb-3">
                          <span className="inline-block text-xs font-bold uppercase tracking-wider text-red-500">
                            {item.category?.name || 'Ecosystem'}
                          </span>
                        </div>
                        <p className="font-sora font-bold text-sm text-gray-900 dark:text-white leading-tight mb-2 group-hover:text-red-500 transition-colors">
                          {item.title}
                        </p>
                        <span className="text-xs text-gray-400 font-jakarta">
                          {formatDate(item.publishedAt)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* ╔════════════════════════════════════════════╗
          ║  9b. AI JOBS                                 ║
          ╚════════════════════════════════════════════╝ */}
      {fetchedJobs && fetchedJobs.length > 0 && (
      <section className="py-8 sm:py-12 cv-auto border-t border-gray-100 dark:border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3">
              <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-brand" />
              <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white">Latest AI Jobs</h2>
            </div>
            <Link href="/jobs" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label="View all jobs">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fetchedJobs.map((job: any) => (
              <Link
                key={job.id}
                href={`/jobs/${job.slug}`}
                className="group bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 sm:p-5 hover:border-brand/30 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  {job.logoUrl ? (
                    <Image src={job.logoUrl} alt={job.companyName} width={40} height={40} className="w-10 h-10 rounded-lg object-contain bg-gray-50 dark:bg-gray-700 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5 text-brand" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-sora font-semibold text-sm text-gray-900 dark:text-white group-hover:text-brand transition-colors line-clamp-1">
                      {job.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">{job.companyName}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-jakarta">
                    <MapPin className="w-2.5 h-2.5" />
                    {job.workType === 'REMOTE' ? 'Remote' : job.workType === 'HYBRID' ? 'Hybrid' : job.city || job.location || 'On-site'}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-jakarta">
                    {job.category?.replace(/_/g, ' ') || 'AI'}
                  </span>
                  {job.showSalary && job.salaryMax && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-jakarta">
                      {job.salaryCurrency === 'INR' ? '₹' : '$'}{(job.salaryMax / 100000).toFixed(0)}L+
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Link href="/employer/signup" className="inline-flex items-center gap-2 text-xs font-jakarta text-gray-500 dark:text-gray-400 hover:text-brand transition-colors">
              <Briefcase className="w-3.5 h-3.5" />
              Post a Job — Reach 5,000+ AI professionals
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
      )}

      {/* ╔════════════════════════════════════════════╗
          ║  9c. UPCOMING EVENTS                        ║
          ╚════════════════════════════════════════════╝ */}
      {fetchedEvents && fetchedEvents.length > 0 && (
      <section className="py-8 sm:py-12 cv-auto border-t border-gray-100 dark:border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-brand" />
              <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white">Upcoming Events</h2>
            </div>
            <Link href="/events" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label="View all events">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {fetchedEvents.map((event: any) => {
              const start = new Date(event.startAt);
              const month = start.toLocaleDateString('en-US', { month: 'short' });
              const day = start.getDate();
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="group bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden hover:border-brand/30 hover:shadow-md transition-all"
                >
                  {event.coverImageUrl ? (
                    <div className="relative h-32 bg-gray-100 dark:bg-gray-700">
                      <Image src={event.coverImageUrl} alt={event.title} fill className="object-cover" sizes="(max-width: 640px) 100vw, 25vw" />
                      <div className="absolute top-2 left-2 bg-white dark:bg-gray-900 rounded-lg px-2 py-1 text-center shadow-sm">
                        <p className="text-[10px] font-bold uppercase text-brand font-jakarta leading-none">{month}</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{day}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-32 bg-gradient-to-br from-brand/10 to-brand/5 dark:from-brand/20 dark:to-brand/5 flex items-center justify-center">
                      <Calendar className="w-8 h-8 text-brand/30" />
                      <div className="absolute top-2 left-2 bg-white dark:bg-gray-900 rounded-lg px-2 py-1 text-center shadow-sm">
                        <p className="text-[10px] font-bold uppercase text-brand font-jakarta leading-none">{month}</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{day}</p>
                      </div>
                    </div>
                  )}
                  <div className="p-3 sm:p-4">
                    <h3 className="font-sora font-semibold text-sm text-gray-900 dark:text-white group-hover:text-brand transition-colors line-clamp-2 leading-snug">
                      {event.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-jakarta">
                        {event.format === 'VIRTUAL' ? 'Online' : event.format === 'HYBRID' ? 'Hybrid' : 'In-Person'}
                      </span>
                      {event.venueName && (
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-jakarta flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" /> {event.venueName}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 text-center">
            <Link href="/organizer/signup" className="inline-flex items-center gap-2 text-xs font-jakarta text-gray-500 dark:text-gray-400 hover:text-brand transition-colors">
              <Calendar className="w-3.5 h-3.5" />
              Host Your Event — Submit for free listing
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
      )}

      {/* ╔════════════════════════════════════════════╗
          ║  10. AI TOOL PICKS — Seamless Grid          ║
          ╚════════════════════════════════════════════╝ */}
      <section className="py-8 sm:py-12 cv-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-brand" />
              <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white">AI Tool Picks</h2>
            </div>
            <Link href="/tools" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label="View all AI tools">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="relative">
            <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
            <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
          <div className="bg-white dark:bg-gray-900 overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Dark header */}
            <div className="bg-gray-900 dark:bg-gray-800 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand shrink-0" />
                <span className="text-white font-bold text-xs sm:text-sm uppercase tracking-wider">Top Rated AI Tools</span>
              </div>
              <div className="bg-gray-800 dark:bg-gray-700 px-2 sm:px-3 py-1 rounded-full shrink-0">
                <span className="text-gray-300 text-xs sm:text-xs font-medium uppercase tracking-wider">Editor Picks</span>
              </div>
            </div>

            {/* 4-col seamless grid, 2 rows */}
            <div className="p-0 bg-gray-50 dark:bg-gray-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {toolPicks.map((tool: any, idx: number, arr: any[]) => {
                  const N = arr.length;
                  const isMobileLast = idx === N - 1;
                  const isTabletLastRow = idx >= N - 2;
                  const isDesktopLastRow = idx >= N - 4;

                  const isTabletRightEdge = idx % 2 === 1;
                  const isDesktopRightEdge = idx % 4 === 3;

                  const borderClass = [
                    !isMobileLast ? 'border-b border-gray-200 dark:border-gray-700' : '',
                    isTabletLastRow ? 'sm:border-b-0' : '',
                    isDesktopLastRow ? 'lg:border-b-0' : 'lg:border-b border-gray-200 dark:border-gray-700',
                    !isTabletRightEdge ? 'sm:border-r border-gray-200 dark:border-gray-700' : 'sm:border-r-0',
                    !isDesktopRightEdge ? 'lg:border-r border-gray-200 dark:border-gray-700' : 'lg:border-r-0'
                  ].filter(Boolean).join(' ');
                  return (
                    <div key={tool.slug} className={`group ${borderClass}`}>
                      <div className="bg-gray-50 dark:bg-gray-800 p-5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 h-full flex flex-col">
                        {/* Top row: icon + rating */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 shrink-0 overflow-hidden shadow-sm">
                            <Image
                              src={tool.logoUrl || `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${tool.slug}.com&size=128`}
                              alt={tool.name}
                              width={40}
                              height={40}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                          {tool.avgRating && (
                            <div className="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
                              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                              <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400">{tool.avgRating}</span>
                            </div>
                          )}
                        </div>
                        {/* Name */}
                        <Link href={`/tools/${tool.slug}`}>
                          <p className="font-sora font-bold text-sm text-gray-900 dark:text-white leading-tight mb-1.5 group-hover:text-brand transition-colors">
                            {tool.name}
                          </p>
                        </Link>
                        {/* Tagline */}
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-jakarta leading-relaxed flex-1 line-clamp-2 mb-3">
                          {tool.tagline}
                        </p>
                        {/* Category & CTA */}
                        <div className="mt-auto space-y-2">
                          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span className="block truncate text-xs font-bold uppercase tracking-wider text-brand" title={tool.category?.name || 'Tool'}>{tool.category?.name || 'Tool'}</span>
                          </div>
                          <ToolCTAButton
                            toolId={tool.id}
                            toolName={tool.name}
                            source="HOMEPAGE"
                            variant="secondary"
                            className="w-full text-xs py-1.5"
                            showIcon={false}
                          >
                            Visit Website
                          </ToolCTAButton>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>
      {/* ╔════════════════════════════════════════════╗
          ║  10b. STARTUP MILESTONES                    ║
          ╚════════════════════════════════════════════╝ */}
      {fetchedMilestones && fetchedMilestones.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 cv-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-sora font-extrabold text-lg sm:text-xl text-navy dark:text-white">
                Startup Milestones
              </h2>
              <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs sm:text-sm mt-0.5">
                Recent achievements from the ecosystem
              </p>
            </div>
            <Link href="/milestones" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta" aria-label="View all startup milestones">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fetchedMilestones.map((m: any) => {
              const icons: Record<string, string> = { FUNDING: '💰', LAUNCH: '🚀', PARTNERSHIP: '🤝', ACQUISITION: '🏢', AWARD: '🏆', HIRING: '👥', REVENUE: '📈', USER_MILESTONE: '🎯' };
              return (
                <Link key={m.id} href={`/startups/${m.startupSlug}`} className="card p-4 hover:border-brand/20 transition-colors group">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{icons[m.type] || '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors truncate">{m.title}</p>
                      <p className="text-xs text-brand font-jakarta font-medium mt-0.5">{m.startupName}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 font-jakarta">
                        <span>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        {m.amount && <span className="font-medium text-gray-600 dark:text-gray-300">{m.currency} {Number(m.amount).toLocaleString()}</span>}
                        {m.verificationStatus === 'PLATFORM_VERIFIED' && <span className="text-green-500">✓ Verified</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ╔════════════════════════════════════════════╗
          ║  11. CTA — Founders / Organizers / Employers║
          ╚════════════════════════════════════════════╝ */}
      <HomeCTA />

      {/* ╔════════════════════════════════════════════╗
          ║  12. EXPLORE SITE (INTERNAL LINKS)         ║
          ╚════════════════════════════════════════════╝ */}
    </>
  );
}

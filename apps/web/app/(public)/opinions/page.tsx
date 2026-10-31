import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import { Metadata } from 'next';
import { getOpinionsDirect, getOpinionTagsDirect, getOpinionContributorsDirect } from '@/lib/db';
import OpinionHero from '@/components/opinions/OpinionHero';
import TopicFilterPills from '@/components/opinions/TopicFilterPills';
import TrendingOpinions from '@/components/opinions/TrendingOpinions';
import ContributorsSection from '@/components/opinions/ContributorsSection';
import EmptyState from '@/components/ui/EmptyState';
import { generateCollectionPageSchema, generateBreadcrumbSchema } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'AI Ecosystem Opinions — Independent Perspectives | Udyaibase',
  description: 'Expert opinions and deep analysis on India\'s AI ecosystem — funding, policy, open-source, startups, and edge AI — from founders, investors, and ecosystem leaders.',
  alternates: { canonical: 'https://udyaibase.com/opinions' },
  openGraph: {
    title: 'AI Ecosystem Opinions — Independent Perspectives | Udyaibase',
    description: 'Expert opinions and deep analysis on India\'s AI ecosystem from founders, investors, and ecosystem leaders.',
    type: 'website',
    url: 'https://udyaibase.com/opinions',
    siteName: 'Udyaibase',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Ecosystem Opinions | Udyaibase',
    description: 'Expert opinions and deep analysis on India\'s AI ecosystem.',
    images: ['https://udyaibase.com/og-image.png'],
  },
};

export const revalidate = 60;

const SITE_URL = 'https://udyaibase.com';

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function StoryGrid({ articles, label }: { articles: any[]; label: string }) {
  return (
    <div className="relative">
      {/* Decorative corner lines */}
      <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
      <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
      <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
      <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
      <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
      <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
      <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
      <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />

      <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700">
        {articles.map((a: any, idx: number) => {
          const N = articles.length;
          const borderClass = [
            idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
            idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
            idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : '',
          ].filter(Boolean).join(' ');
          return (
            <Link key={a.slug} href={`/opinions/${a.slug}`} className="group h-full">
              <div className={`bg-gray-50 dark:bg-gray-900 p-3 sm:p-6 relative hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} hover:border-l-4 hover:border-l-red-500 h-full flex flex-col`}>
                <div className="mb-1.5 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                  <span className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-500">Opinion</span>
                  {a.primaryTag && (
                    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 font-jakarta">{a.primaryTag.name}</span>
                  )}
                </div>
                <p className="font-sora font-bold text-[15px] leading-snug sm:text-lg sm:leading-tight mb-1.5 sm:mb-3 text-gray-900 dark:text-white group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">
                  {a.title}
                </p>
                <p className="text-gray-600 dark:text-gray-400 font-jakarta text-xs sm:text-sm leading-relaxed mb-2 sm:mb-4 line-clamp-2 sm:line-clamp-3 flex-1">
                  {a.excerpt || ''}
                </p>
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-gray-400 font-jakarta mt-auto">
                  {a.author?.name && <><span>{a.author.name}</span><span>·</span></>}
                  <span>{formatDate(a.publishedAt)}</span>
                  {a.readTimeMinutes && <><span>·</span><span>{a.readTimeMinutes} min</span></>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function OpinionsPage() {
  const [tags, featured, trending, latest, contributors] = await Promise.all([
    getOpinionTagsDirect(),
    getOpinionsDirect({ isFeatured: true, limit: 4 }),
    getOpinionsDirect({ sortBy: 'trending', limit: 10 }),
    getOpinionsDirect({ limit: 20 }),
    getOpinionContributorsDirect(12),
  ]);

  const collectionSchema = generateCollectionPageSchema({
    name: 'AI Ecosystem Opinions',
    description: 'Expert opinions and deep analysis on India\'s AI ecosystem.',
    url: `${SITE_URL}/opinions`,
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Opinions', url: `${SITE_URL}/opinions` },
  ]);

  const hasContent = latest.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <OpinionHero />

      {/* Topic pills — full-bleed on mobile for edge-to-edge swipe */}
      <div className="-mx-3 sm:mx-0 px-3 sm:px-0 mb-6 sm:mb-8">
        <TopicFilterPills tags={tags as any[]} />
      </div>

      {!hasContent ? (
        <EmptyState
          title="No opinion articles yet"
          description="Opinion pieces will appear here once published from the admin panel."
        />
      ) : (
        <>
          {/* Featured */}
          {featured.length >= 1 && (
            <section className="mb-8 sm:mb-14">
              <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white mb-4 sm:mb-6">Featured Opinions</h2>
              <StoryGrid articles={featured} label="Featured" />
            </section>
          )}

          {/* Latest + Sidebar — stacked on mobile */}
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            <div className="flex-1 min-w-0">
              <section>
                <h2 className="font-sora font-bold text-base sm:text-2xl text-gray-900 dark:text-white mb-4 sm:mb-6">Latest Opinions</h2>
                <StoryGrid articles={latest} label="Latest" />
              </section>
            </div>

            {/* Sidebar — full width on mobile, stacked below content */}
            <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6 sm:space-y-8">
              <TrendingOpinions articles={trending} />
              <ContributorsSection contributors={contributors as any[]} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

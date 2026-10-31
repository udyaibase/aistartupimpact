import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { getArticlesDirect, getActiveCreativeForZone } from '@/lib/db';
import { generateCollectionPageSchema, generateItemListSchema, generateBreadcrumbSchema } from '@/lib/seo';
import ArticlesListClient from '@/components/ArticlesListClient';
import SubscribeForm from '@/components/SubscribeForm';
import EmptyState from '@/components/ui/EmptyState';

export const metadata: Metadata = {
  title: 'Latest AI News — India & Global',
  description:
    'Breaking AI news, startup updates, funding announcements, and ecosystem intelligence from India and around the world. Updated daily.',
  alternates: { canonical: 'https://udyaibase.com/news' },
  openGraph: {
    title: 'Latest AI News — India & Global',
    description:
      'Breaking AI news, startup updates, funding announcements, and ecosystem intelligence from India and around the world.',
    type: 'website',
    url: 'https://udyaibase.com/news',
    siteName: 'Udyaibase',
    images: [{ url: 'https://udyaibase.com/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Latest AI News — India & Global',
    description: 'Breaking AI news, startup updates, and ecosystem intelligence.',
    creator: '@aikitstartup',
  },
};

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export const revalidate = 60;

export default async function NewsPage() {
  const [articles, inArticleAd] = await Promise.all([
    getArticlesDirect({ type: 'NEWS', limit: 100 }) as Promise<any[]>,
    getActiveCreativeForZone('A1_IN_ARTICLE'),
  ]);
  const allArticles = articles || [];
  const featured = allArticles.filter((a) => a.isFeatured).slice(0, 2);

  const siteUrl = 'https://udyaibase.com';

  const collectionSchema = generateCollectionPageSchema({
    name: 'Latest AI News — India & Global',
    description:
      'Breaking AI news, startup updates, funding announcements, and ecosystem intelligence from India and around the world.',
    url: `${siteUrl}/news`,
  });

  const itemListSchema =
    allArticles.length > 0
      ? generateItemListSchema({
          name: 'Latest AI News Articles',
          description: 'Most recent AI startup news from India and around the world.',
          url: `${siteUrl}/news`,
          items: allArticles.slice(0, 20).map((a: any, i: number) => ({
            position: i + 1,
            name: a.title,
            url: `${siteUrl}/news/${a.slug}`,
            description: a.excerpt || undefined,
          })),
        })
      : null;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'News', url: `${siteUrl}/news` },
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {itemListSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }} />
      )}

      {/* Header */}
      <div className="mb-4 sm:mb-8">
        <h1 className="font-sora font-extrabold text-xl sm:text-3xl md:text-4xl text-navy dark:text-white leading-tight tracking-tight">
          AI News.{' '}
          <span className="text-brand">Updated daily.</span>
        </h1>
        <p className="text-gray-500 dark:text-gray-400 font-jakarta mt-1.5 sm:mt-2 text-xs sm:text-sm max-w-2xl">
          Breaking funding rounds, policy updates, and ecosystem intelligence from India and the world.
        </p>
      </div>

      {allArticles.length === 0 && (
        <EmptyState title="No articles yet" description="Check back soon for the latest AI news and updates." />
      )}

      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 lg:gap-10">
        {/* ── Main column ── */}
        <div className="flex-1 min-w-0">
          {/* All Articles with filters at top */}
          {allArticles.length > 0 && (
            <ArticlesListClient articles={allArticles} />
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6">
          {/* Newsletter CTA */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-brand mb-2">Free Weekly</div>
            <h3 className="font-sora font-bold text-base text-navy dark:text-white leading-snug mb-1">
              India AI Digest
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4 leading-relaxed">
              Join 5,000+ founders and investors getting the week's top AI stories every Friday.
            </p>
            <SubscribeForm source="sidebar" buttonText="Subscribe Free" />
          </div>

          {/* Categories — link to filtered view */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-4">Quick Links</h3>
            <div className="space-y-2">
              <Link href="/stories" className="flex items-center justify-between text-sm font-jakarta text-gray-600 dark:text-gray-300 hover:text-brand transition-colors">
                <span>Founder Stories</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link href="/funding" className="flex items-center justify-between text-sm font-jakarta text-gray-600 dark:text-gray-300 hover:text-brand transition-colors">
                <span>Funding Tracker</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link href="/tools" className="flex items-center justify-between text-sm font-jakarta text-gray-600 dark:text-gray-300 hover:text-brand transition-colors">
                <span>AI Tools Directory</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link href="/startups" className="flex items-center justify-between text-sm font-jakarta text-gray-600 dark:text-gray-300 hover:text-brand transition-colors">
                <span>Startup Directory</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Trending */}
          {allArticles.slice(0, 5).length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
              <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-4">Trending Now</h3>
              <div className="space-y-3">
                {allArticles.slice(0, 5).map((a: any, i: number) => (
                  <Link key={a.slug} href={`/news/${a.slug}`} className="group flex gap-3 items-start">
                    <span className="font-sora font-extrabold text-xl text-gray-100 dark:text-gray-800 leading-none shrink-0 w-6 text-right">
                      {i + 1}
                    </span>
                    <p className="text-xs font-semibold text-navy dark:text-white group-hover:text-brand transition-colors leading-snug line-clamp-2 font-jakarta">
                      {a.title}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

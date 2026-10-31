import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { getArticlesDirect } from '@/lib/db';
import { generateCollectionPageSchema, generateItemListSchema, generateBreadcrumbSchema } from '@/lib/seo';
import StoriesListClient from '@/components/StoriesListClient';
import SubscribeForm from '@/components/SubscribeForm';
import EmptyState from '@/components/ui/EmptyState';

export const metadata: Metadata = {
  title: 'Founder Stories — Indian AI Entrepreneurs',
  description:
    "Deep-dive interviews and profiles of the founders building India's AI future. Learn from their journeys, challenges, and insights.",
  alternates: { canonical: 'https://udyaibase.com/stories' },
  openGraph: {
    title: 'Founder Stories — Indian AI Entrepreneurs',
    description: "Deep-dive interviews and profiles of the founders building India's AI future.",
    type: 'website',
    url: 'https://udyaibase.com/stories',
    siteName: 'Udyaibase',
    images: [{ url: 'https://udyaibase.com/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Founder Stories — Indian AI Entrepreneurs',
    description: "Deep-dive interviews and profiles of the founders building India's AI future.",
    creator: '@aikitstartup',
  },
};

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export const revalidate = 60;

export default async function StoriesPage() {
  const [editorialStories, founderStories] = await Promise.all([
    getArticlesDirect({ type: 'STORY', limit: 100 }),
    getArticlesDirect({ type: 'FOUNDER_STORY', limit: 50 }),
  ]);
  const articles: any[] = [...(editorialStories || []), ...(founderStories || [])]
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
  const featured = articles.filter((a) => a.isFeatured).slice(0, 2);

  const siteUrl = 'https://udyaibase.com';

  const collectionSchema = generateCollectionPageSchema({
    name: 'Founder Stories — Indian AI Entrepreneurs',
    description: "Deep-dive interviews and profiles of the founders building India's AI future.",
    url: `${siteUrl}/stories`,
  });

  const itemListSchema =
    articles.length > 0
      ? generateItemListSchema({
          name: 'Founder Stories',
          description: 'Profiles and interviews with Indian AI startup founders.',
          url: `${siteUrl}/stories`,
          items: articles.slice(0, 20).map((a: any, i: number) => ({
            position: i + 1,
            name: a.title,
            url: `${siteUrl}/stories/${a.slug}`,
            description: a.excerpt || undefined,
          })),
        })
      : null;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'Founder Stories', url: `${siteUrl}/stories` },
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {itemListSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }} />
      )}

      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="font-sora font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy dark:text-white leading-tight tracking-tight">
          Founder Stories.{' '}
          <span className="text-brand">Unfiltered.</span>
        </h1>
        <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm max-w-2xl mt-2">
          Deep-dive interviews and profiles of the founders building the AI future — their journeys, challenges, and hard-won insights.
        </p>
      </div>

      {articles.length === 0 && (
        <EmptyState title="No stories yet" description="Check back soon for founder stories and deep-dive interviews." />
      )}

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        {/* ── Main column ── */}
        <div className="flex-1 min-w-0">
          {articles.length > 0 && (
            <StoriesListClient stories={articles} excludeSlugs={featured.map((a) => a.slug)}>
              {/* Featured — rendered between filters and story grid */}
              {featured.length > 0 && (
                <div className="relative mb-8 sm:mb-10">
                  <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent hidden sm:block" />
                  <h2 className="font-sora font-bold text-base sm:text-xl text-gray-900 dark:text-white mb-4 sm:mb-5">Featured Stories</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700">
                    {featured.map((story, idx) => {
                      const N = featured.length;
                      const borderClass = [
                        idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
                        idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
                        idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <Link key={story.slug} href={`/stories/${story.slug}`} className="group h-full">
                          <div className={`bg-gray-50 dark:bg-gray-900 relative hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} hover:border-l-4 hover:border-l-red-500 h-full flex flex-col`}>
                            {(story.thumbnailImage || story.coverImage) && (
                              <div className="relative aspect-[16/9] overflow-hidden">
                                <Image
                                  src={story.thumbnailImage || story.coverImage}
                                  alt={story.title}
                                  fill
                                  sizes="(max-width: 640px) 100vw, 50vw"
                                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                              </div>
                            )}
                            <div className="p-3 sm:p-5 flex flex-col flex-1">
                              <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
                                <span className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-500">Featured</span>
                                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 font-jakarta">{story.category?.name || 'Founder Story'}</span>
                              </div>
                              <p className="font-sora font-bold text-[15px] leading-snug sm:text-lg sm:leading-tight mb-1.5 sm:mb-2 text-gray-900 dark:text-white group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">
                                {story.title}
                              </p>
                              {story.excerpt && (
                                <p className="text-gray-600 dark:text-gray-400 font-jakarta text-xs sm:text-sm leading-relaxed mb-2 sm:mb-3 line-clamp-2 flex-1">
                                  {story.excerpt}
                                </p>
                              )}
                              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-gray-400 font-jakarta mt-auto">
                                {story.author?.name && <><span>{story.author.name}</span><span>·</span></>}
                                <span>{formatDate(story.publishedAt)}</span>
                                {story.readTimeMinutes && <><span>·</span><span>{story.readTimeMinutes} min</span></>}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </StoriesListClient>
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6">
          {/* Newsletter CTA */}
          <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-brand mb-2">Free Weekly</div>
            <h3 className="font-sora font-bold text-base text-navy dark:text-white leading-snug mb-1">
              India AI Digest
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4 leading-relaxed">
              Join 5,000+ founders and investors getting the week's top AI stories every Friday.
            </p>
            <SubscribeForm source="sidebar" buttonText="Subscribe Free" />
          </div>

          {/* About */}
          <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">About Founder Stories</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta leading-relaxed">
              In-depth profiles of the builders, investors, and operators shaping India's AI ecosystem. Every story is independently reported — no PR, no fluff.
            </p>
          </div>

          {/* Topics */}
          <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-4">Story Themes</h3>
            <div className="flex flex-wrap gap-2">
              {['Origin Story', 'Fundraising', 'Product', 'Team Building', 'Failure', 'Vision', 'India Stack', 'Global Expansion'].map((tag) => (
                <span key={tag} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-brand/10 hover:text-brand cursor-pointer transition-colors font-jakarta">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Recent stories quick list */}
          {articles.slice(0, 5).length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
              <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-4">Recent Stories</h3>
              <ol className="space-y-3">
                {articles.slice(0, 5).map((s: any, i: number) => (
                  <li key={s.slug}>
                    <Link href={`/stories/${s.slug}`} className="group flex gap-3 items-start">
                      <span aria-hidden="true" className="font-sora font-extrabold text-xl text-gray-300 dark:text-gray-600 leading-none shrink-0 w-6 text-right tabular-nums">
                        {i + 1}
                      </span>
                      <span className="text-xs font-semibold text-navy dark:text-white group-hover:text-brand transition-colors leading-snug line-clamp-2 font-jakarta">
                        {s.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

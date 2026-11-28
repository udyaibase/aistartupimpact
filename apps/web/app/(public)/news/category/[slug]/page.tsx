import { jsonLd } from '@/lib/json-ld';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronRight, Clock } from 'lucide-react';
import { getArticleCategoryPageDirect, getArticleCategoriesDirect } from '@/lib/db';
import { articlePath, generateBreadcrumbSchema, generateCollectionPageSchema, generateItemListSchema, isSponsoredArticle } from '@/lib/seo';
import SponsoredTag from '@/components/article/SponsoredTag';
import EmptyState from '@/components/ui/EmptyState';

/**
 * One article category: every published article filed under it, newest first. Categories are managed in the admin
 * (Articles → Categories); the address uses the category's slug, which stays the same when it is renamed.
 */

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

const describe = (c: { name: string; description: string | null }) =>
  c.description?.trim() || `${c.name}: the latest articles, analysis and stories from India's AI startup ecosystem on Udyaibase.`;

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await getArticleCategoryPageDirect(slug, 1);
  if (!data) return { title: 'Category not found' };
  const { category, articles } = data;
  const url = `${SITE_URL}/news/category/${category.slug}`;
  const description = describe(category);
  return {
    title: `${category.name} — AI News & Stories`,
    description,
    alternates: { canonical: url },
    // A category with nothing published yet is a thin page: keep it out of search until it has articles.
    robots: articles.length === 0 ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${category.name} — AI News & Stories`, description, type: 'website', url, siteName: 'Udyaibase',
      images: [{ url: `${SITE_URL}/og-image.webp`, width: 2250, height: 1181 }],
    },
    twitter: { card: 'summary_large_image', title: `${category.name} — AI News & Stories`, description, creator: '@aikitstartup' },
  };
}

export default async function ArticleCategoryPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const [data, categories] = await Promise.all([getArticleCategoryPageDirect(slug), getArticleCategoriesDirect()]);
  if (!data) notFound();
  const { category, articles } = data;
  const url = `${SITE_URL}/news/category/${category.slug}`;
  const others = categories.filter((c) => c.slug !== category.slug);

  const collectionSchema = generateCollectionPageSchema({ name: category.name, description: describe(category), url });
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'News', url: `${SITE_URL}/news` },
    { name: category.name, url },
  ]);
  const itemListSchema = articles.length
    ? generateItemListSchema({
        name: `${category.name} articles`, description: describe(category), url,
        items: articles.slice(0, 20).map((a: any, i: number) => ({
          position: i + 1, name: a.title, url: `${SITE_URL}${articlePath(a.type, a.slug)}`, description: a.excerpt || undefined,
        })),
      })
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {itemListSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }} />}

      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <Link href="/news" className="hover:text-brand">News</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[220px]">{category.name}</span>
      </nav>

      <div className="mb-6 sm:mb-8">
        <h1 className="font-sora font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy dark:text-white leading-tight tracking-tight">{category.name}</h1>
        <p className="text-gray-600 dark:text-gray-400 font-jakarta mt-2 text-sm max-w-2xl">{describe(category)}</p>
        {articles.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-2">{articles.length.toLocaleString('en-IN')} article{articles.length === 1 ? '' : 's'}</p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 lg:gap-10">
        <div className="flex-1 min-w-0">
          {articles.length === 0 ? (
            <EmptyState title="Nothing here yet" description="No articles have been published in this category so far." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              {articles.map((a: any) => (
                <li key={a.id}>
                  <Link href={articlePath(a.type, a.slug)} className="group flex gap-4 sm:gap-5 p-4 sm:p-5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gradient-to-br from-brand/10 to-gray-100 dark:from-brand/20 dark:to-gray-800">
                      {(a.thumbnailImage || a.coverImage) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnailImage || a.coverImage} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 text-xs text-gray-500 dark:text-gray-400 font-jakarta">
                        {isSponsoredArticle(a) && <SponsoredTag />}
                        {a.readTimeMinutes ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden />{a.readTimeMinutes} min read</span> : null}
                      </div>
                      <h2 className="font-sora font-bold text-sm sm:text-[15px] text-navy dark:text-white group-hover:text-brand transition-colors leading-snug line-clamp-2">{a.title}</h2>
                      {a.excerpt && <p className="hidden sm:block text-xs text-gray-600 dark:text-gray-400 font-jakarta mt-1 line-clamp-2 leading-relaxed">{a.excerpt}</p>}
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-2">
                        {[a.authorName, formatDate(a.publishedAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {others.length > 0 && (
          <aside className="w-full lg:w-72 xl:w-80 shrink-0">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
              <h2 className="font-sora font-bold text-sm text-navy dark:text-white mb-4">More categories</h2>
              <ul className="space-y-2">
                {others.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/news/category/${c.slug}`} className="flex items-center justify-between text-sm font-jakarta text-gray-700 dark:text-gray-300 hover:text-brand transition-colors">
                      <span>{c.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{c.articles.toLocaleString('en-IN')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

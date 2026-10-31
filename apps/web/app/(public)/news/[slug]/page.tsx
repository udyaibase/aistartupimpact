import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, Calendar, ChevronRight } from 'lucide-react';
import StorySaveButton from '@/components/StorySaveButton';
import { sql, getArticleBySlugDirect, getRelatedArticlesDirect } from '@/lib/db';
import { defaultHeroArticle, defaultLatestStories, defaultIndiaAI } from '@/lib/fallbacks';
import { buildArticleMetadata, generateArticleSchema, generateBreadcrumbSchema } from '@/lib/seo';
import { sanitizeHtml } from '@/lib/sanitize';
import TrackView from '@/components/TrackView';
import ShareMenu from '@/components/shared/ShareMenu';
import ArticleActions from '@/components/ArticleActions';
import SubscribeForm from '@/components/SubscribeForm';

export const revalidate = 60;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const article = await getArticleBySlugDirect(params.slug);
  if (!article) return { title: 'Article Not Found' };
  return buildArticleMetadata(article);
}

export async function generateStaticParams() {
  try {
    const rows = await sql`
      SELECT slug FROM "Article"
      WHERE type = 'NEWS' AND status = 'PUBLISHED' AND "deletedAt" IS NULL
      ORDER BY "publishedAt" DESC NULLS LAST
      LIMIT 50
    `;
    return rows.map((r: any) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

export default async function ArticlePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  let article = await getArticleBySlugDirect(params.slug);

  if (!article) {
    if (params.slug === defaultHeroArticle.slug) article = defaultHeroArticle as any;
    else if (defaultLatestStories.find(s => s.slug === params.slug)) article = defaultLatestStories.find(s => s.slug === params.slug) as any;
    else if (defaultIndiaAI.find(s => s.slug === params.slug)) article = defaultIndiaAI.find(s => s.slug === params.slug) as any;
  }

  if (!article) notFound();

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  const bodyHtml = sanitizeHtml(
    typeof article.content === 'object'
      ? (article.content?.html || article.content?.text || article.excerpt || '')
      : String(article.content || article.excerpt || '')
  );

  // Shown under /news, so only article types that live in the news section.
  const relatedArticles = await getRelatedArticlesDirect(article.id, ['NEWS', 'TOOL_REVIEW', 'GUIDE', 'COMPARISON', 'REPORT', 'SPONSORED', 'STARTUP_UPDATE'], 3);

  const siteUrl = 'https://udyaibase.com';
  const articleUrl = `${siteUrl}/news/${article.slug}`;

  const articleSchema = generateArticleSchema({
    title: article.title,
    excerpt: article.excerpt || '',
    author: { name: article.author?.name || 'ASI Editorial', slug: article.author?.slug || 'editorial' },
    date: article.publishedAt,
    updatedAt: article.updatedAt,
    url: articleUrl,
    imageUrl: article.coverImage || undefined,
    category: article.category?.name || 'Technology',
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'News', url: `${siteUrl}/news` },
    { name: article.category?.name || 'Article', url: `${siteUrl}/news` },
    { name: article.title, url: articleUrl },
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <TrackView entityType="article" entityId={article.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/news" className="hover:text-brand">News</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[200px]">{article.category?.name || 'Article'}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <article className="flex-1 min-w-0 max-w-3xl mx-auto lg:mx-0 w-full">
          <span className="badge-brand text-xs mb-4 inline-block">{article.category?.name || 'News'}</span>

          <h1 className="font-sora font-extrabold text-[22px] leading-[1.2] sm:text-3xl md:text-[36px] md:leading-[1.2] text-navy dark:text-white">
            {article.title}
          </h1>

          {article.excerpt && (
            <p className="article-lede text-gray-500 dark:text-gray-400 font-jakarta text-sm sm:text-base mt-3 sm:mt-4 leading-relaxed">
              {article.excerpt}
            </p>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pb-6 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-sm text-brand font-bold font-sora">
                {article.author?.name?.charAt(0) || 'A'}
              </div>
              <div>
                <span className="text-sm font-semibold text-navy dark:text-white font-jakarta">{article.author?.name || 'Author'}</span>
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 font-jakarta">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <time dateTime={article.publishedAt || new Date().toISOString()}>Published on: {formatDate(article.publishedAt)}</time>
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{article.readTimeMinutes} min read</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShareMenu
                url={`https://udyaibase.com/news/${article.slug}`}
                title={article.title}
                utmCampaign="article_share"
                variant="icon"
                entityType="ARTICLE"
                entityId={article.id}
              />
              <StorySaveButton slug={article.slug} />
            </div>
          </div>

          {article.coverImage ? (
            <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-6 sm:my-8">
              <Image src={article.coverImage} alt={article.title} fill sizes="100vw" className="object-cover" />
            </div>
          ) : (
            <div className="aspect-[16/9] bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl my-6 sm:my-8" />
          )}

          <div className="article-content prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

          {/* Likes, Comments, Share */}
          <ArticleActions
            slug={article.slug}
            initialLikes={(article as any).likeCount || 0}
            title={article.title}
          />

          {relatedArticles.length > 0 && (
            <div className="mt-10 sm:mt-12">
              <h2 className="section-title mb-6">Related Articles</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedArticles.map((rela: any) => (
                  <Link key={rela.slug} href={`/news/${rela.slug}`} className="group">
                    <div className="card p-4 h-full">
                      <span className="badge-category text-xs mb-2 inline-block">{rela.category?.name || 'News'}</span>
                      <h3 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors leading-snug line-clamp-3">{rela.title}</h3>
                      <span className="text-xs text-gray-400 font-jakarta mt-2 block">{rela.readTimeMinutes} min</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6">
          {article.linkedTool && (
            <div className="card p-5 border-brand-200 dark:border-brand-900/50 bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-900">
              <span className="badge-brand text-xs mb-2 inline-block">Featured Tool</span>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-800 flex flex-shrink-0 items-center justify-center shadow-sm">
                  {article.linkedTool.logoUrl ? (
                    <Image src={article.linkedTool.logoUrl} alt={article.linkedTool.name} width={24} height={24} sizes="24px" className="w-6 h-6 object-contain" />
                  ) : (
                    <span className="font-sora font-bold text-brand">{article.linkedTool.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h4 className="font-sora font-bold text-sm text-navy dark:text-white">{article.linkedTool.name}</h4>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-sm font-bold block whitespace-nowrap">★ {article.linkedTool.avgRating}</span>
                    <span className="text-xs text-gray-500">{article.linkedTool.pricingModel}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 font-jakarta mb-4 line-clamp-2">
                {article.linkedTool.tagline}
              </p>
              <Link href={`/tools/${article.linkedTool.slug}`} className="btn-brand text-xs w-full justify-center">
                Try {article.linkedTool.name}
              </Link>
            </div>
          )}

          <div className="card p-5 bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-900">
            <h4 className="font-sora font-bold text-sm text-navy dark:text-white mb-2">Get weekly insights</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4">Join 5,000+ founders reading our AI ecosystem digest.</p>
            <SubscribeForm source="sidebar" buttonText="Subscribe Free" />
          </div>
        </aside>
      </div>
    </div>
  );
}

import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, Calendar, ChevronRight } from 'lucide-react';
import StorySaveButton from '@/components/StorySaveButton';
import { sql, getArticleBySlugDirect, getArticlesDirect } from '@/lib/db';
import { buildArticleMetadata, generateArticleSchema, generateBreadcrumbSchema } from '@/lib/seo';
import { sanitizeHtml } from '@/lib/sanitize';
import ShareButton from '@/components/ShareButton';
import ArticleActions from '@/components/ArticleActions';
import SubscribeForm from '@/components/SubscribeForm';

export const revalidate = 60;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const article = await getArticleBySlugDirect(params.slug);
  if (!article) return { title: 'Article Not Found' };
  const meta = buildArticleMetadata(article);
  return {
    ...meta,
    alternates: { canonical: `https://udyaibase.com/opinion/${params.slug}` },
  };
}

export async function generateStaticParams() {
  try {
    const rows = await sql`
      SELECT slug FROM "Article"
      WHERE type = 'OPINION' AND status = 'PUBLISHED' AND "deletedAt" IS NULL
      ORDER BY "publishedAt" DESC NULLS LAST
      LIMIT 50
    `;
    return rows.map((r: any) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

export default async function OpinionArticlePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const article = await getArticleBySlugDirect(params.slug);
  if (!article) notFound();

  const related = await getArticlesDirect({ type: 'OPINION', limit: 4 });

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  const bodyHtml = sanitizeHtml(
    typeof article.content === 'object'
      ? (article.content?.html || article.content?.text || article.excerpt || '')
      : String(article.content || article.excerpt || '')
  );

  const relatedArticles = (related || []).filter((a: any) => a.slug !== params.slug).slice(0, 3);

  const siteUrl = 'https://udyaibase.com';
  const articleUrl = `${siteUrl}/opinion/${article.slug}`;

  const articleSchema = generateArticleSchema({
    title: article.title,
    excerpt: article.excerpt || '',
    author: { name: article.author?.name || 'ASI Editorial', slug: article.author?.slug || 'editorial' },
    date: article.publishedAt,
    updatedAt: article.updatedAt,
    url: articleUrl,
    imageUrl: article.coverImage || undefined,
    category: article.category?.name || 'Opinion',
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'Opinion', url: `${siteUrl}/opinion` },
    { name: article.title, url: articleUrl },
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
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
        <Link href="/opinion" className="hover:text-brand">Opinion</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[200px]">{article.category?.name || 'Analysis'}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <article className="flex-1 min-w-0 max-w-3xl mx-auto lg:mx-0 w-full">
          <span className="badge-brand text-xs mb-4 inline-block">{article.category?.name || 'Opinion'}</span>

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
              <ShareButton title={article.title} />
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

          <ArticleActions
            slug={article.slug}
            initialLikes={(article as any).likeCount || 0}
            title={article.title}
          />

          {relatedArticles.length > 0 && (
            <div className="mt-10 sm:mt-12">
              <h2 className="section-title mb-6">More Opinion & Analysis</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedArticles.map((rela: any) => (
                  <Link key={rela.slug} href={`/opinion/${rela.slug}`} className="group">
                    <div className="card p-4 h-full">
                      <span className="badge-category text-xs mb-2 inline-block">{rela.category?.name || 'Opinion'}</span>
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

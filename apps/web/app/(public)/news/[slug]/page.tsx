import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, ArrowRight, BadgeCheck, Star } from 'lucide-react';
import StorySaveButton from '@/components/StorySaveButton';
import ReadingProgress from '@/components/stories/ReadingProgress';
import StoryCard from '@/components/stories/StoryCard';
import { formatStoryDate, initials } from '@/components/stories/storyMeta';
import { addHeadingIds, comparableText } from '@/lib/article-headings';
import { sql, getArticleBySlugDirect, getRelatedArticlesDirect } from '@/lib/db';
import { defaultHeroArticle, defaultLatestStories, defaultIndiaAI } from '@/lib/fallbacks';
import { buildArticleMetadata, generateArticleSchema, generateBreadcrumbSchema, NEWS_EDITORIAL_TYPES, isSponsoredArticle } from '@/lib/seo';
import SponsoredTag from '@/components/article/SponsoredTag';
import { redirectOldArticleSlug } from '@/lib/article-redirect';
import { articleBodyHtml } from '@/lib/article-body';
import { getArticleEntityCards } from '@/lib/article-entities';
import EntityHoverCards from '@/components/article/EntityHoverCards';
import TrackView from '@/components/TrackView';
import ShareMenu from '@/components/shared/ShareMenu';
import ArticleActions from '@/components/ArticleActions';
import SubscribeForm from '@/components/SubscribeForm';

export const revalidate = 3600;

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

/** A round photo (or initials), or a square logo. Same as the founder story page. */
function Avatar({ src, name, size, square = false }: { src?: string | null; name?: string | null; size: number; square?: boolean }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-800 font-sora font-bold text-gray-600 dark:text-gray-300 ${square ? 'rounded-[10px]' : 'rounded-full'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {src ? <Image src={src} alt="" width={size} height={size} sizes={`${size}px`} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

/**
 * One news article, laid out like a founder story (app/(public)/stories/[slug]/page.tsx): a single centred reading
 * column, a compact byline strip, contents for long pieces, then who wrote it and what it mentions, related news and
 * the newsletter. Keep the two pages in step.
 */
export default async function ArticlePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  let article = await getArticleBySlugDirect(params.slug);

  if (!article) {
    if (params.slug === defaultHeroArticle.slug) article = defaultHeroArticle as any;
    else if (defaultLatestStories.find(s => s.slug === params.slug)) article = defaultLatestStories.find(s => s.slug === params.slug) as any;
    else if (defaultIndiaAI.find(s => s.slug === params.slug)) article = defaultIndiaAI.find(s => s.slug === params.slug) as any;
  }

  if (!article) await redirectOldArticleSlug(params.slug);
  if (!article) notFound();

  // A founder's own update or story belongs under Stories. Opened here it carried a "News" badge, as if we wrote it.
  if (article.type === 'STARTUP_UPDATE' || article.type === 'FOUNDER_STORY') permanentRedirect(`/stories/${article.slug}`);

  const { html: bodyHtml, headings } = addHeadingIds(articleBodyHtml(article));
  // Some articles open with the summary as their first paragraph; don't print it twice.
  const showLede = !!article.excerpt && !comparableText(bodyHtml).startsWith(comparableText(article.excerpt).slice(0, 120));

  const entityCards = await getArticleEntityCards(bodyHtml);

  // Shown under /news, so only article types that live in the news section.
  const relatedArticles = await getRelatedArticlesDirect(article.id, NEWS_EDITORIAL_TYPES, 4);

  const siteUrl = 'https://udyaibase.com';
  const articleUrl = `${siteUrl}/news/${article.slug}`;
  const author: any = article.author || {};
  const category = article.category as null | { name?: string | null; slug?: string | null };
  const tool = article.linkedTool as null | { name: string; slug: string; tagline?: string | null; logoUrl?: string | null; pricingModel?: string | null; avgRating?: number | string | null };
  const startup = (article as any).linkedStartup as null | { name: string; slug: string; tagline?: string | null; logoUrl?: string | null; isVerified?: boolean };

  const articleSchema = generateArticleSchema({
    title: article.title,
    excerpt: article.excerpt || '',
    author: { name: author.name || 'Udyaibase Editorial', slug: author.slug || 'udyaibase-editorial' },
    date: article.publishedAt,
    updatedAt: article.updatedAt,
    url: articleUrl,
    imageUrl: article.coverImage || undefined,
    category: category?.name || 'Technology',
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'News', url: `${siteUrl}/news` },
    { name: category?.name || 'Article', url: category?.slug ? `${siteUrl}/news/category/${category.slug}` : `${siteUrl}/news` },
    { name: article.title, url: articleUrl },
  ]);

  const cardCls = 'group flex items-center gap-3 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3.5 hover:border-gray-300 dark:hover:border-gray-700';
  const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-gray-400 font-jakarta';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-10 sm:pt-8">
      <TrackView entityType="article" entityId={article.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      <ReadingProgress targetId="article-body" />

      <article className="mx-auto max-w-[820px]">
        <nav aria-label="Breadcrumb" className="flex items-center gap-0.5 text-sm font-jakarta text-gray-500 dark:text-gray-400 mb-2 sm:mb-4">
          <Link href="/news" className="-ml-1 inline-flex min-h-[40px] items-center gap-1 pl-1 pr-1 hover:text-brand">
            <ChevronLeft className="w-4 h-4" aria-hidden /> News
          </Link>
          {category?.name && (
            <>
              <span aria-hidden>/</span>
              {category.slug
                ? <Link href={`/news/category/${category.slug}`} className="inline-flex min-h-[40px] items-center truncate px-1 hover:text-brand">{category.name}</Link>
                : <span className="truncate px-1">{category.name}</span>}
            </>
          )}
        </nav>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand font-jakarta">AI News</span>
          {isSponsoredArticle(article) && <SponsoredTag />}
        </div>

        <h1 className="font-sora font-extrabold text-[26px] leading-[1.2] sm:text-[36px] sm:leading-[1.15] tracking-tight text-navy dark:text-white">
          {article.title}
        </h1>

        {showLede && (
          <p className="article-lede mt-3 text-[17px] sm:text-lg leading-relaxed text-gray-600 dark:text-gray-400 font-jakarta">
            {article.excerpt}
          </p>
        )}

        {/* Who wrote it, when, and the actions */}
        <div className="mt-5 flex items-center justify-between gap-3 border-y border-gray-100 dark:border-gray-800 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar src={author.avatar} name={author.name || 'Udyaibase'} size={36} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[14px] font-semibold text-gray-900 dark:text-white font-jakarta">
                {author.slug ? <Link href={`/authors/${author.slug}`} className="hover:text-brand">{author.name}</Link> : (author.name || 'Udyaibase')}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-gray-500 dark:text-gray-400 font-jakarta">
                <span className="truncate max-w-full">Udyaibase editorial</span>
                <span aria-hidden>·</span>
                <span className="whitespace-nowrap">
                  <time dateTime={article.publishedAt || undefined}>{formatStoryDate(article.publishedAt)}</time>
                  {article.readTimeMinutes ? <> · {article.readTimeMinutes} min read</> : null}
                </span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StorySaveButton slug={article.slug} />
            <ShareMenu url={articleUrl} title={article.title} utmCampaign="article_share" variant="icon" entityType="ARTICLE" entityId={article.id} />
          </div>
        </div>

        {article.coverImage && (
          <figure className="relative mt-5 aspect-[16/9] overflow-hidden rounded-[14px] bg-gray-100 dark:bg-gray-800 sm:-mx-6">
            <Image src={article.coverImage} alt={article.title} fill priority sizes="(max-width: 860px) 100vw, 820px" className="object-cover" />
          </figure>
        )}

        {headings.length >= 3 && (
          <details className="group mt-6 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/60">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold text-gray-900 dark:text-white font-jakarta [&::-webkit-details-marker]:hidden">
              In this article
              <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ol className="space-y-0.5 px-2 pb-3">
              {headings.map((h, i) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="flex min-h-[40px] items-center gap-3 rounded-[10px] px-2 text-[15px] text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:text-brand font-jakarta">
                    <span className="w-5 shrink-0 text-right text-sm tabular-nums text-gray-400">{i + 1}</span>{h.text}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        )}

        <div id="article-body" className="mt-6">
          <EntityHoverCards cards={entityCards}>
            <div className="article-content story-body prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </EntityHoverCards>
        </div>

        <ArticleActions slug={article.slug} initialLikes={(article as any).likeCount || 0} title={article.title} />

        {/* Who wrote it, and the tool or startup it's about */}
        {(author.name || tool || startup) && (
          <section aria-label="About" className="mt-7 grid gap-2.5">
            {author.name && (
              <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3.5">
                <p className={labelCls}>Written by</p>
                <div className="mt-2 flex items-start gap-3">
                  <Avatar src={author.avatar} name={author.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-sora text-[15px] font-bold leading-snug text-gray-900 dark:text-white">{author.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">Udyaibase editorial</p>
                    {author.bio && <p className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-gray-300 font-jakarta line-clamp-4">{author.bio}</p>}
                    {author.slug && (
                      <Link href={`/authors/${author.slug}`} className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-sm font-semibold text-brand hover:underline">
                        More from {String(author.name).split(' ')[0]} <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tool && (
              <Link href={`/tools/${tool.slug}`} className={cardCls}>
                <Avatar src={tool.logoUrl} name={tool.name} size={44} square />
                <div className="min-w-0 flex-1">
                  <p className={labelCls}>Tool in this article</p>
                  <p className="font-sora text-[15px] font-bold text-gray-900 dark:text-white truncate">{tool.name}</p>
                  {tool.tagline && <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta line-clamp-2">{tool.tagline}</p>}
                  {(Number(tool.avgRating) > 0 || tool.pricingModel) && (
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-gray-500 font-jakarta">
                      {Number(tool.avgRating) > 0 && <><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />{Number(tool.avgRating).toFixed(1)}</>}
                      {Number(tool.avgRating) > 0 && tool.pricingModel && <span aria-hidden>·</span>}
                      {tool.pricingModel && <span className="capitalize">{tool.pricingModel.replace(/_/g, ' ').toLowerCase()}</span>}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )}

            {startup && (
              <Link href={`/startups/${startup.slug}`} className={cardCls}>
                <Avatar src={startup.logoUrl} name={startup.name} size={44} square />
                <div className="min-w-0 flex-1">
                  <p className={labelCls}>Startup in this article</p>
                  <p className="flex items-center gap-1.5 font-sora text-[15px] font-bold text-gray-900 dark:text-white">
                    <span className="truncate">{startup.name}</span>
                    {startup.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" aria-label="Verified" />}
                  </p>
                  {startup.tagline && <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta line-clamp-2">{startup.tagline}</p>}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )}
          </section>
        )}
      </article>

      {relatedArticles.length > 0 && (
        <section className="mx-auto mt-12 max-w-5xl" aria-labelledby="more-news">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="more-news" className="font-sora text-lg sm:text-xl font-bold text-gray-900 dark:text-white">More AI news</h2>
            <Link href="/news" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand hover:underline">
              See all <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {relatedArticles.map((a: any) => <StoryCard key={a.slug} story={a} href={`/news/${a.slug}`} sizes="(max-width: 640px) 96px, 260px" />)}
          </div>
        </section>
      )}

      <section className="mx-auto mt-10 max-w-5xl">
        <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:flex sm:items-center sm:gap-8">
          <div className="sm:flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-brand mb-1.5 font-jakarta">Free every Friday</p>
            <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-1">Get the India AI Digest</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta mb-4 sm:mb-0">The week&apos;s top AI stories for founders and investors.</p>
          </div>
          <div className="sm:w-[380px]"><SubscribeForm source="sidebar" buttonText="Subscribe free" /></div>
        </div>
      </section>
    </div>
  );
}

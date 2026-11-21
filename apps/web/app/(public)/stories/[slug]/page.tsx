import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, ArrowRight, ArrowUpRight, BadgeCheck } from 'lucide-react';
import ReadingProgress from '@/components/stories/ReadingProgress';
import StoryCard, { FounderBadge } from '@/components/stories/StoryCard';
import { formatStoryDate, initials, isFounderWritten, storyTopic } from '@/components/stories/storyMeta';
import StorySaveButton from '@/components/StorySaveButton';
import { sql, getArticleBySlugDirect, getRelatedArticlesDirect } from '@/lib/db';
import { defaultFounderSpotlights } from '@/lib/fallbacks';
import { buildArticleMetadata, generateArticleSchema, generateBreadcrumbSchema } from '@/lib/seo';
import { articleBodyHtml } from '@/lib/article-body';
import { addHeadingIds, comparableText } from '@/lib/article-headings';
import { getArticleEntityCards } from '@/lib/article-entities';
import EntityHoverCards from '@/components/article/EntityHoverCards';
import ShareButton from '@/components/ShareButton';
import ArticleActions from '@/components/ArticleActions';
import SubscribeForm from '@/components/SubscribeForm';

export const revalidate = 3600;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const story = await getArticleBySlugDirect(params.slug);
  if (!story) return { title: 'Story Not Found' };
  return buildArticleMetadata({ ...story, type: 'STORY' });
}

export async function generateStaticParams() {
  try {
    const rows = await sql`
      SELECT slug FROM "Article"
      WHERE type = 'STORY' AND status = 'PUBLISHED' AND "deletedAt" IS NULL
      ORDER BY "publishedAt" DESC NULLS LAST
      LIMIT 50
    `;
    return rows.map((r: any) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

/** SERIES_A → "Series A", PRE_SEED → "Pre-Seed", IDEA → "Idea stage". */
const stageLabel = (s?: string | null) => {
  if (!s) return null;
  if (s === 'IDEA') return 'Idea stage';
  return s.split('_').map((w) => (w.length <= 1 ? w : w[0] + w.slice(1).toLowerCase())).join(' ').replace(/^Pre /, 'Pre-');
};

function Avatar({ src, name, size, square = false }: { src?: string | null; name?: string | null; size: number; square?: boolean }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-800 font-sora font-bold text-gray-600 dark:text-gray-300 ${square ? 'rounded-[10px]' : 'rounded-full'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {src ? <Image src={src} alt="" width={size} height={size} sizes={`${size}px`} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export default async function StoryDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  let story: any = await getArticleBySlugDirect(params.slug);

  if (!story) {
    if (defaultFounderSpotlights.find(s => s.slug === params.slug)) {
      story = defaultFounderSpotlights.find(s => s.slug === params.slug) as any;
    }
  }

  if (!story) notFound();

  const founder = isFounderWritten(story);
  const topic = storyTopic(story);
  const startup = story.linkedStartup as null | { name: string; slug: string; tagline?: string | null; logoUrl?: string | null; isVerified?: boolean; stage?: string | null; foundedYear?: number | null };
  const author = story.author || {};
  // A founder who chose not to be named is shown as their startup; then there's no personal card.
  const namedFounder = founder && author.name && author.name !== startup?.name;

  const { html: bodyHtml, headings } = addHeadingIds(articleBodyHtml(story));

  // Many stories open with the summary as their first paragraph; don't print it twice.
  const showLede = !!story.excerpt && !comparableText(bodyHtml).startsWith(comparableText(story.excerpt).slice(0, 120));

  const entityCards = await getArticleEntityCards(bodyHtml);

  const relatedStories = await getRelatedArticlesDirect(story.id, ['STORY', 'FOUNDER_STORY'], 4);

  const siteUrl = 'https://udyaibase.com';
  const storyUrl = `${siteUrl}/stories/${story.slug}`;

  const articleSchema = generateArticleSchema({
    title: story.title,
    excerpt: story.excerpt || '',
    author: { name: author.name || 'Udyaibase Editorial', slug: author.slug || 'udyaibase-editorial' },
    date: story.publishedAt,
    updatedAt: story.updatedAt,
    url: storyUrl,
    imageUrl: story.coverImage || undefined,
    category: founder ? 'Founder Story' : topic,
    isStory: true,
    founderData: startup && (startup as any).founders?.length > 0 ? {
      name: (startup as any).founders[0],
      slug: (startup as any).founders[0].toLowerCase().replace(/\s+/g, '-'),
      startupSlug: startup.slug
    } : undefined
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'Founder Stories', url: `${siteUrl}/stories` },
    { name: story.title, url: storyUrl },
  ]);

  const authorLine = founder
    ? [author.role, startup?.name && namedFounder ? startup.name : null].filter(Boolean).join(' at ') || (namedFounder ? 'Founder' : 'Startup')
    : 'Udyaibase editorial';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-10 sm:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      <ReadingProgress targetId="story-body" />

      <article className="mx-auto max-w-[720px]">
        <nav aria-label="Breadcrumb" className="flex items-center gap-0.5 text-sm font-jakarta text-gray-500 dark:text-gray-400 mb-2 sm:mb-4">
          <Link href="/stories" className="-ml-1 inline-flex min-h-[40px] items-center gap-1 pl-1 pr-1 hover:text-brand">
            <ChevronLeft className="w-4 h-4" aria-hidden /> Stories
          </Link>
          <span aria-hidden>/</span>
          <Link href={`/stories?topic=${encodeURIComponent(topic)}`} className="inline-flex min-h-[40px] items-center truncate px-1 hover:text-brand">{topic}</Link>
        </nav>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {founder
            ? <FounderBadge />
            : <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300 font-jakarta">Editorial</span>}
        </div>

        <h1 className="font-sora font-extrabold text-[26px] leading-[1.2] sm:text-[36px] sm:leading-[1.15] tracking-tight text-navy dark:text-white">
          {story.title}
        </h1>

        {showLede && (
          <p className="mt-3 text-[17px] sm:text-lg leading-relaxed text-gray-600 dark:text-gray-400 font-jakarta">
            {story.excerpt}
          </p>
        )}

        {/* Who wrote it, when, and the actions */}
        <div className="mt-5 flex items-center justify-between gap-3 border-y border-gray-100 dark:border-gray-800 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar src={author.avatar} name={author.name} size={44} square={founder && !namedFounder} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-gray-900 dark:text-white font-jakarta">
                {author.slug && !founder
                  ? <Link href={`/authors/${author.slug}`} className="hover:text-brand">{author.name}</Link>
                  : (author.name || 'Udyaibase')}
              </p>
              <p className="truncate text-[13px] text-gray-500 dark:text-gray-400 font-jakarta">
                {startup && founder && namedFounder ? (
                  <>{author.role ? `${author.role} at ` : 'Founder, '}<Link href={`/startups/${startup.slug}`} className="font-medium text-gray-700 dark:text-gray-300 hover:text-brand">{startup.name}</Link></>
                ) : authorLine}
              </p>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 font-jakarta">
                <time dateTime={story.publishedAt || undefined}>{formatStoryDate(story.publishedAt)}</time>
                {story.readTimeMinutes ? <> · {story.readTimeMinutes} min read</> : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StorySaveButton slug={story.slug} />
            <ShareButton title={story.title} iconOnly size="lg" className="!rounded-full !border-0 !shadow-none !bg-transparent !text-gray-500 hover:!bg-gray-100 dark:hover:!bg-gray-800" />
          </div>
        </div>

        {story.coverImage && (
          <figure className="relative mt-5 aspect-[16/9] overflow-hidden rounded-[14px] bg-gray-100 dark:bg-gray-800 sm:-mx-6">
            <Image src={story.coverImage} alt={story.title} fill priority sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
          </figure>
        )}

        {headings.length >= 3 && (
          <details className="group mt-6 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/60">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold text-gray-900 dark:text-white font-jakarta [&::-webkit-details-marker]:hidden">
              In this story
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

        <div id="story-body" className="mt-6">
          <EntityHoverCards cards={entityCards}>
            <div className="article-content story-body prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </EntityHoverCards>
        </div>

        <ArticleActions slug={story.slug} initialLikes={story.likeCount || 0} title={story.title} />

        {/* The people and the company behind it */}
        {(namedFounder || (!founder && author.name) || startup) && (
          <section aria-label="About" className="mt-8 grid gap-3">
            {namedFounder && (
              <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 font-jakarta">Written by</p>
                <div className="mt-3 flex items-start gap-3">
                  <Avatar src={author.avatar} name={author.name} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="font-sora text-base font-bold text-gray-900 dark:text-white">{author.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">{[author.role || 'Founder', startup?.name].filter(Boolean).join(', ')}</p>
                    {author.bio && <p className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-gray-300 font-jakarta line-clamp-4">{author.bio}</p>}
                    {author.linkedin && /^https?:\/\//i.test(author.linkedin) && (
                      <a href={author.linkedin} target="_blank" rel="noopener noreferrer nofollow"
                        className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] border border-gray-200 dark:border-gray-700 px-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-gray-300">
                        LinkedIn <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!founder && author.name && (
              <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 font-jakarta">Written by</p>
                <div className="mt-3 flex items-start gap-3">
                  <Avatar src={author.avatar} name={author.name} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="font-sora text-base font-bold text-gray-900 dark:text-white">{author.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">Udyaibase editorial</p>
                    {author.bio && <p className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-gray-300 font-jakarta line-clamp-4">{author.bio}</p>}
                    {author.slug && (
                      <Link href={`/authors/${author.slug}`} className="mt-3 inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand hover:underline">
                        More from {author.name.split(' ')[0]} <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {startup && (
              <Link href={`/startups/${startup.slug}`}
                className="group flex items-center gap-3 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 hover:border-gray-300 dark:hover:border-gray-700">
                <Avatar src={startup.logoUrl} name={startup.name} size={52} square />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 font-jakarta">{founder ? 'The startup' : 'Startup in this story'}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-sora text-base font-bold text-gray-900 dark:text-white">
                    <span className="truncate">{startup.name}</span>
                    {startup.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" aria-label="Verified" />}
                  </p>
                  {startup.tagline && <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta line-clamp-2">{startup.tagline}</p>}
                  {(stageLabel(startup.stage) || startup.foundedYear) && (
                    <p className="mt-1 text-[13px] text-gray-500 font-jakarta">
                      {[stageLabel(startup.stage), startup.foundedYear ? `Founded ${startup.foundedYear}` : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )}
          </section>
        )}
      </article>

      {relatedStories.length > 0 && (
        <section className="mx-auto mt-12 max-w-5xl" aria-labelledby="more-stories">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="more-stories" className="font-sora text-lg sm:text-xl font-bold text-gray-900 dark:text-white">More stories</h2>
            <Link href="/stories" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand hover:underline">
              See all <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {relatedStories.map((s: any) => <StoryCard key={s.slug} story={s} sizes="(max-width: 640px) 96px, 260px" />)}
          </div>
        </section>
      )}

      <section className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-5">
        <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:col-span-3">
          <p className="text-xs font-bold uppercase tracking-wider text-brand mb-1.5 font-jakarta">Free every Friday</p>
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-1">Get the India AI Digest</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta mb-4">The week&apos;s top AI stories for founders and investors.</p>
          <SubscribeForm source="sidebar" buttonText="Subscribe free" />
        </div>
        <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:col-span-2 flex flex-col">
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-1">Building an AI startup?</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Share your story, or reach AI founders with a featured spot.</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Link href="/founder/content" className="inline-flex min-h-[44px] items-center rounded-[10px] bg-gray-900 dark:bg-white px-4 text-sm font-semibold text-white dark:text-gray-900">Write a story</Link>
            <Link href="/advertise" className="inline-flex min-h-[44px] items-center rounded-[10px] border border-gray-200 dark:border-gray-700 px-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Advertise</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

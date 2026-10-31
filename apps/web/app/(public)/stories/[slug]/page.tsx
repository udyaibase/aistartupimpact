import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, Calendar, ChevronRight, Users } from 'lucide-react';
import StorySaveButton from '@/components/StorySaveButton';
import { sql, getArticleBySlugDirect, getRelatedArticlesDirect } from '@/lib/db';
import { defaultFounderSpotlights } from '@/lib/fallbacks';
import { buildArticleMetadata, generateArticleSchema, generateBreadcrumbSchema } from '@/lib/seo';
import { sanitizeHtml } from '@/lib/sanitize';
import ShareButton from '@/components/ShareButton';
import ArticleActions from '@/components/ArticleActions';
import SubscribeForm from '@/components/SubscribeForm';

export const revalidate = 60;

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

export default async function StoryDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  let story = await getArticleBySlugDirect(params.slug);

  if (!story) {
    if (defaultFounderSpotlights.find(s => s.slug === params.slug)) {
      story = defaultFounderSpotlights.find(s => s.slug === params.slug) as any;
    }
  }

  if (!story) notFound();

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  const bodyHtml = sanitizeHtml(
    typeof story.content === 'object'
      ? (story.content?.html || story.content?.text || story.excerpt || '')
      : String(story.content || story.excerpt || '')
  );

  const relatedStories = await getRelatedArticlesDirect(story.id, ['STORY', 'FOUNDER_STORY'], 3);

  const siteUrl = 'https://udyaibase.com';
  const storyUrl = `${siteUrl}/stories/${story.slug}`;

  const articleSchema = generateArticleSchema({
    title: story.title,
    excerpt: story.excerpt || '',
    author: { name: story.author?.name || 'ASI Editorial', slug: story.author?.slug || 'editorial' },
    date: story.publishedAt,
    updatedAt: story.updatedAt,
    url: storyUrl,
    imageUrl: story.coverImage || undefined,
    category: 'Founder Story',
    isStory: true,
    founderData: story.linkedStartup && story.linkedStartup.founders?.length > 0 ? {
      name: story.linkedStartup.founders[0],
      slug: story.linkedStartup.founders[0].toLowerCase().replace(/\s+/g, '-'),
      startupSlug: story.linkedStartup.slug
    } : undefined
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'Founder Stories', url: `${siteUrl}/stories` },
    { name: story.title, url: storyUrl },
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/stories" className="hover:text-brand">Stories</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[200px]">Founder Story</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* ── Main Article ── */}
        <article className="flex-1 min-w-0">
          <span className="badge-brand text-xs mb-4 inline-block">Founder Story</span>

          <h1 className="font-sora font-extrabold text-[22px] leading-[1.2] sm:text-3xl md:text-[36px] md:leading-[1.2] text-navy dark:text-white">
            {story.title}
          </h1>

          {story.excerpt && (
            <p className="article-lede text-gray-500 dark:text-gray-400 font-jakarta text-sm sm:text-base mt-3 sm:mt-4 leading-relaxed">
              {story.excerpt}
            </p>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pb-6 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-sm text-brand font-bold font-sora">
                {story.author?.name?.charAt(0) || 'A'}
              </div>
              <div>
                <span className="text-sm font-semibold text-navy dark:text-white font-jakarta">{story.author?.name || 'Author'}</span>
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 font-jakarta">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <time dateTime={story.publishedAt || new Date().toISOString()}>Published on: {formatDate(story.publishedAt)}</time>
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{story.readTimeMinutes} min read</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShareButton title={story.title} />
              <StorySaveButton slug={story.slug} />
            </div>
          </div>

          {story.coverImage ? (
            <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-6 sm:my-8">
              <Image src={story.coverImage} alt={story.title} fill sizes="100vw" className="object-cover" />
            </div>
          ) : (
            <div className="aspect-[16/9] bg-gradient-to-br from-brand-50 to-gray-50 dark:from-brand-900/20 dark:to-gray-900 rounded-xl my-6 sm:my-8 flex items-center justify-center">
              <Users className="w-20 h-20 text-brand/20" />
            </div>
          )}

          <div className="article-content prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

          {/* Likes, Comments, Share */}
          <ArticleActions
            slug={story.slug}
            initialLikes={(story as any).likeCount || 0}
            title={story.title}
          />

          {relatedStories.length > 0 && (
            <div className="mt-10">
              <h2 className="section-title mb-6">More Founder Stories</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedStories.map((s: any) => (
                  <Link key={s.slug} href={`/stories/${s.slug}`} className="group">
                    <div className="card p-4 h-full">
                      <span className="badge-category text-xs mb-2 inline-block">Founder Story</span>
                      <h3 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors leading-snug line-clamp-3">{s.title}</h3>
                      <span className="text-xs text-gray-400 font-jakarta mt-2 block">{s.readTimeMinutes} min</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6">

          {/* Newsletter */}
          <div className="card p-5 bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-900">
            <h4 className="font-sora font-bold text-sm text-navy dark:text-white mb-2">Get weekly insights</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4">
              Join 5,000+ founders reading our India AI ecosystem digest every Friday.
            </p>
            <SubscribeForm source="sidebar" buttonText="Subscribe Free" />
          </div>

          {/* More Stories */}
          {relatedStories.length > 0 && (
            <div className="card p-5">
              <h4 className="font-sora font-bold text-sm text-navy dark:text-white mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-brand" /> More Founder Stories
              </h4>
              <div className="space-y-4">
                {relatedStories.map((s: any) => (
                  <Link key={s.slug} href={`/stories/${s.slug}`} className="group block">
                    <h5 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors leading-snug line-clamp-2">
                      {s.title}
                    </h5>
                    <span className="text-xs text-gray-400 font-jakarta mt-1 block">{s.readTimeMinutes} min read</span>
                  </Link>
                ))}
              </div>
              <Link href="/stories" className="text-brand text-xs font-semibold hover:underline mt-4 block font-jakarta">
                View all stories →
              </Link>
            </div>
          )}

          {/* Advertise */}
          <div className="card p-5">
            <h4 className="font-sora font-bold text-sm text-navy dark:text-white mb-2">Reach AI founders</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-3">
              Advertise to 50,000+ monthly readers in India's AI ecosystem.
            </p>
            <Link href="/advertise" className="btn-outline text-xs w-full text-center block">
              View Media Kit →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRight, PenLine } from 'lucide-react';
import { storyTopic } from '@/components/stories/storyMeta';
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
    images: [{ url: 'https://udyaibase.com/og-image.webp', width: 2250, height: 1181 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Founder Stories — Indian AI Entrepreneurs',
    description: "Deep-dive interviews and profiles of the founders building India's AI future.",
    creator: '@aikitstartup',
  },
};

export const revalidate = 300;

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

  // Lead story: the newest featured one, otherwise the newest story.
  const leadSlug = (featured[0] || articles[0])?.slug || null;

  // Topics that actually have stories, as links into the filtered list.
  const topicCounts = new Map<string, number>();
  articles.forEach((a) => { const t = storyTopic(a); topicCounts.set(t, (topicCounts.get(t) || 0) + 1); });
  const topics = Array.from(topicCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {itemListSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }} />
      )}

      <header className="mb-5 sm:mb-7 max-w-3xl">
        <h1 className="font-sora font-extrabold text-[28px] sm:text-4xl text-navy dark:text-white leading-tight tracking-tight">
          Founder Stories
        </h1>
        <p className="text-gray-600 dark:text-gray-400 font-jakarta text-[15px] sm:text-base leading-relaxed mt-2">
          How India&apos;s AI startups are being built, told by the founders themselves and by the Udyaibase team.
        </p>
      </header>

      {articles.length === 0 && (
        <EmptyState title="No stories yet" description="Check back soon for founder stories and deep-dive interviews." />
      )}

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <div className="flex-1 min-w-0">
          {articles.length > 0 && (
            <Suspense fallback={<div className="h-40" aria-hidden />}>
              <StoriesListClient stories={articles} leadSlug={leadSlug} />
            </Suspense>
          )}
        </div>

        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4 lg:pt-1">
          {/* For founders: write your own */}
          <div className="relative overflow-hidden rounded-[14px] bg-[linear-gradient(135deg,#17171a_0%,#0b0b0c_55%,#000_100%)] p-5 text-white">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-brand/40 blur-3xl" />
            <p className="relative inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/60 font-jakarta">
              <PenLine className="h-3.5 w-3.5" aria-hidden /> For founders
            </p>
            <h2 className="relative mt-2 font-sora text-lg font-bold leading-snug">Tell your startup&apos;s story</h2>
            <p className="relative mt-1 text-sm text-white/70 font-jakarta leading-relaxed">
              Write it in your own words. It appears here with your name and a link to your startup.
            </p>
            <Link href="/founder/content" className="relative mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              Write a story <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {/* What's here, accurately */}
          <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <h2 className="font-sora font-bold text-[15px] text-navy dark:text-white mb-2">About these stories</h2>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">
              <li><span className="font-semibold text-gray-800 dark:text-gray-200">Editorial</span> stories are written by the Udyaibase team.</li>
              <li><span className="font-semibold text-gray-800 dark:text-gray-200">By the founder</span> stories are written by the founder and checked by our team before they go live.</li>
            </ul>
          </div>

          {topics.length > 1 && (
            <nav aria-label="Topics" className="hidden lg:block rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h2 className="font-sora font-bold text-[15px] text-navy dark:text-white mb-3">Topics</h2>
              <div className="flex flex-wrap gap-2">
                {topics.map(([name, n]) => (
                  <Link key={name} href={`/stories?topic=${encodeURIComponent(name)}`}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-brand/10 hover:text-brand font-jakarta">
                    {name} <span className="tabular-nums text-gray-400">{n}</span>
                  </Link>
                ))}
              </div>
            </nav>
          )}

          <div className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-brand mb-1.5 font-jakarta">Free every Friday</p>
            <h2 className="font-sora font-bold text-[15px] text-navy dark:text-white leading-snug mb-1">India AI Digest</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta mb-4 leading-relaxed">
              The week&apos;s top AI stories for founders and investors.
            </p>
            <SubscribeForm source="sidebar" buttonText="Subscribe free" />
          </div>
        </aside>
      </div>
    </div>
  );
}

import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Metadata } from 'next';
import { generateItemListSchema, generateCollectionPageSchema, generateBreadcrumbSchema } from '@/lib/seo';
import FounderActionButton from '@/components/auth/FounderActionButton';
import { Code, MessageSquare, GraduationCap, Video, Music, Zap, PenTool, Palette, Megaphone, BarChart3, DollarSign, Image, Bot, ShoppingCart, Scale, Shield, ChevronRight, Folder } from 'lucide-react';

const ToolsListWithComparison = dynamic(() => import('@/components/ToolsListWithComparison'), {
  loading: () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        ))}
      </div>
    </div>
  ),
});
const DiscoverySections = dynamic(() => import('@/components/tools/DiscoverySections'), {
  loading: () => (
    <div className="space-y-6 mb-8 animate-pulse">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i}>
          <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded mb-3" />
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="shrink-0 w-56 h-36 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
});

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Editor's Picks: Best AI Tools — Reviewed & Rated",
  description:
    "150+ AI tools reviewed and rated by our editorial team. Honest verdicts, ratings, and pricing — no pay-to-play, no affiliate bias.",
  alternates: { canonical: 'https://udyaibase.com/tools' },
  openGraph: {
    title: "Editor's Picks: Best AI Tools — Reviewed & Rated",
    description:
      "150+ AI tools reviewed and rated by our editorial team. Honest verdicts, ratings, and pricing.",
    type: 'website',
    url: 'https://udyaibase.com/tools',
    siteName: 'Udyaibase',
    images: [{ url: 'https://udyaibase.com/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Editor's Picks: Best AI Tools",
    description: "150+ AI tools reviewed and rated. Honest verdicts, ratings, and pricing.",
    creator: '@aikitstartup',
  },
};

import { getDirectoryToolsDirect, getToolCategoryTreeDirect, getToolTagGroupsForFilterDirect, getToolTagMappingsDirect, getTrendingToolsDirect, getRecentlyAddedToolsDirect, getEditorPicksDirect, getMostUpvotedThisMonthDirect } from '@/lib/db';

export default async function ToolsPage(
  props: { searchParams: Promise<{ category?: string; tag?: string; pricing?: string }> }
) {
  const searchParams = await props.searchParams;
  const [picks, categoryTree, tagGroups, toolTagMap, trending, recentlyAdded, editorPicks, mostUpvoted] = await Promise.all([
    getDirectoryToolsDirect(),
    getToolCategoryTreeDirect(),
    getToolTagGroupsForFilterDirect(),
    getToolTagMappingsDirect(),
    getTrendingToolsDirect(12),
    getRecentlyAddedToolsDirect(12),
    getEditorPicksDirect(12),
    getMostUpvotedThisMonthDirect(12),
  ]);

  // Resolve initial tag slug to tag ID if ?tag= query param provided
  const initialTagSlug = searchParams.tag || null;
  let initialTagId: string | null = null;
  if (initialTagSlug) {
    for (const group of tagGroups) {
      const found = group.tags.find((t: any) => t.slug === initialTagSlug);
      if (found) {
        initialTagId = found.id;
        break;
      }
    }
  }

  const initialPricing = searchParams.pricing || null;

  const siteUrl = 'https://udyaibase.com';

  const itemListSchema = generateItemListSchema({
    name: "Editor's Picks: Best AI Tools",
    description: "AI tools reviewed and rated by the Udyaibase editorial team.",
    url: `${siteUrl}/tools`,
    items: picks.map((t, i) => ({
      position: i + 1,
      name: t.name,
      url: `${siteUrl}/tools/${t.slug}`,
      description: t.tagline,
    })),
  });

  const collectionSchema = generateCollectionPageSchema({
    name: "Editor's Picks: Best AI Tools",
    description: "AI tools reviewed and rated by the Udyaibase editorial team. No pay-to-play, no affiliate bias.",
    url: `${siteUrl}/tools`,
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'AI Tools', url: `${siteUrl}/tools` },
  ]);

  // Get category tree for browse grid
  const categoryMeta: Record<string, { icon: any; color: string; bg: string }> = {
    'code-development': { icon: Code, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
    'customer-experience': { icon: MessageSquare, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40' },
    'education-research': { icon: GraduationCap, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/40' },
    'video': { icon: Video, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40' },
    'audio-music': { icon: Music, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/40' },
    'productivity-workspace': { icon: Zap, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' },
    'writing-content': { icon: PenTool, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/40' },
    'design-creative': { icon: Palette, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-100 dark:bg-pink-900/40' },
    'marketing-advertising': { icon: Megaphone, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-900/40' },
    'sales-crm': { icon: BarChart3, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/40' },
    'data-analytics': { icon: BarChart3, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
    'finance-accounting': { icon: DollarSign, color: 'text-lime-600 dark:text-lime-400', bg: 'bg-lime-100 dark:bg-lime-900/40' },
    'image-generation-editing': { icon: Image, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/40' },
    'ai-agents-infrastructure': { icon: Bot, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-900/40' },
    'e-commerce': { icon: ShoppingCart, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/40' },
    'legal-compliance': { icon: Scale, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-200 dark:bg-slate-800/40' },
    'security-it': { icon: Shield, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-200 dark:bg-gray-700/40' },
  };
  const defaultMeta = { icon: Folder, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800/40' };
  // Count tools per parent category from actual picks data (matches filter pill counts)
  const realCounts = new Map<string, number>();
  for (const p of picks) {
    const slug = (p as any).parentCategorySlug || (p as any).categorySlug;
    if (slug) realCounts.set(slug, (realCounts.get(slug) || 0) + 1);
  }
  const parentCategoriesForGrid = (categoryTree as any[])
    .map((c: any) => ({ ...c, totalToolCount: realCounts.get(c.slug) || 0 }))
    .filter((c: any) => c.totalToolCount > 0)
    .sort((a: any, b: any) => b.totalToolCount - a.totalToolCount);
  const totalTools = picks.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-24 sm:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      {/* Hero Section */}
      <div className="mb-6 sm:mb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
          <div>
            <h1 className="font-sora font-extrabold text-lg sm:text-2xl md:text-3xl lg:text-4xl text-navy dark:text-white leading-tight tracking-tight">
              Find the right AI tool.{' '}
              <span className="text-brand">Not just the most popular one.</span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs sm:text-sm max-w-2xl mt-1 sm:mt-2">
              {picks.length}+ AI tools across {parentCategoriesForGrid.length} categories — powered by real reviews.
            </p>
          </div>
          <FounderActionButton
            href="/founder/tools/new"
            className="border border-brand text-brand bg-brand/5 hover:bg-brand/10 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold font-jakarta text-xs sm:text-sm transition-colors whitespace-nowrap text-center shrink-0 w-full md:w-auto"
          >
            + Submit Your Tool
          </FounderActionButton>
        </div>

        {/* Search Suggestions as Filter Shortcuts */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-xs text-gray-400 font-jakarta">Popular:</span>
          <Link href="/tools/category/writing-content" className="px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand/10 hover:text-brand transition-colors active:scale-95">Write blog posts</Link>
          <Link href="/tools/category/image-generation-editing" className="px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand/10 hover:text-brand transition-colors active:scale-95">Generate images</Link>
          <Link href="/tools/category/code-development" className="px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand/10 hover:text-brand transition-colors active:scale-95">Code assistant</Link>
          <Link href="/tools?pricing=FREE" className="px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-full text-xs font-semibold font-jakarta bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 transition-colors active:scale-95">Free tools</Link>
          <Link href="/tools/category/customer-experience" className="px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand/10 hover:text-brand transition-colors active:scale-95">AI chatbots</Link>
          <Link href="/tools/category/video" className="px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand/10 hover:text-brand transition-colors active:scale-95">Video creation</Link>
        </div>
      </div>

      {/* Discovery Sections */}
      <DiscoverySections
        trending={trending as any[]}
        recentlyAdded={recentlyAdded as any[]}
        editorPicks={editorPicks as any[]}
        mostUpvoted={mostUpvoted as any[]}
      />

      {/* Browse by Category */}
      {parentCategoriesForGrid.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <div className="flex items-baseline justify-between mb-3 sm:mb-4">
            <h2 className="font-sora font-bold text-sm sm:text-lg text-navy dark:text-white">Browse by category</h2>
            <span className="text-xs sm:text-sm text-gray-400 font-jakarta">{totalTools} tools</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
            {parentCategoriesForGrid.map((cat: any) => {
              const meta = categoryMeta[cat.slug] || defaultMeta;
              const IconComp = meta.icon;
              return (
                <Link
                  key={cat.slug}
                  href={`/tools/category/${cat.slug}`}
                  className="flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm transition-all group"
                >
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                    <IconComp className={`w-4 h-4 sm:w-5 sm:h-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sora font-semibold text-xs sm:text-sm text-navy dark:text-white group-hover:text-brand transition-colors">{cat.name}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400 font-jakarta">{cat.totalToolCount} {cat.totalToolCount === 1 ? 'tool' : 'tools'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-brand transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Tools List Component with State */}
      <ToolsListWithComparison picks={picks} tagGroups={tagGroups} toolTagMap={toolTagMap} initialTagId={initialTagId} initialPricing={initialPricing} />


    </div>
  );
}

import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star, ChevronRight, ExternalLink } from 'lucide-react';
import { getAiToolBySlugDirect, getToolAlternativesDirect, getSimilarToolsDirect } from '@/lib/db';

export const revalidate = 86400;

// Pages are built on first visit and then cached (no list at build time); refreshed when content changes.
export async function generateStaticParams() {
  return [];
}

/**
 * Hand-picked alternatives first (ToolAlternative), topped up with the best-rated tools in the same category.
 * The sitemap lists every tool that has another tool in its category, so a page with no hand-picked alternatives
 * used to 404 — every /tools/alternatives URL in the sitemap that Google fetched came back "not found".
 */
async function loadAlternatives(tool: any): Promise<any[]> {
  const curated = (await getToolAlternativesDirect(tool.id)) as any[];
  if (curated.length >= 10 || !tool.categoryId) return curated.slice(0, 10);
  const similar = (await getSimilarToolsDirect(tool.categoryId, tool.slug, 10)) as any[];
  const seen = new Set(curated.map((a) => a.id));
  return [...curated, ...similar.filter((t) => t.id !== tool.id && !seen.has(t.id))].slice(0, 10);
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const tool = await getAiToolBySlugDirect(params.slug) as any;
  if (!tool) return { title: 'Not Found' };
  const alternatives = await loadAlternatives(tool);
  const year = new Date().getFullYear();
  const count = alternatives.length >= 3 ? `${alternatives.length} ` : '';
  const title = `${count}Best ${tool.name} Alternatives in ${year} (Free & Paid)`;
  const names = alternatives.slice(0, 3).map((a) => a.name).join(', ');
  const description = names
    ? `Top ${tool.name} alternatives in ${year}: ${names} and more — compared by features, pricing and ratings.`
    : `Looking for alternatives to ${tool.name}? Compare the best options by features, pricing and ratings.`;
  return {
    title,
    description,
    alternates: { canonical: `https://udyaibase.com/tools/alternatives/${params.slug}` },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function AlternativesPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const tool = await getAiToolBySlugDirect(params.slug) as any;
  if (!tool) notFound();

  const alternatives = await loadAlternatives(tool);
  if (alternatives.length < 1) notFound();
  const category = tool.categoryName || tool.category?.name || null;
  const freeCount = alternatives.filter((a) => /FREE|OPEN_SOURCE|FREEMIUM/.test(a.pricingModel || '')).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/tools" className="hover:text-brand">Tools</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/tools/${tool.slug}`} className="hover:text-brand">{tool.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">Alternatives</span>
      </nav>

      {/* Header */}
      <h1 className="font-sora font-extrabold text-2xl md:text-3xl text-navy dark:text-white mb-2">
        Best {tool.name} Alternatives in {new Date().getFullYear()}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mb-8 max-w-2xl leading-relaxed">
        {tool.name} is {tool.tagline ? <>{tool.tagline.replace(/\.$/, '').charAt(0).toLowerCase() + tool.tagline.replace(/\.$/, '').slice(1)}</> : 'an AI tool'}
        {category ? <> in the {category} category</> : null}. If it isn&apos;t the right fit, here are {alternatives.length} alternatives
        {freeCount > 0 ? <> — {freeCount} with a free or freemium plan</> : null}, ranked by user ratings. Open any tool for its full
        review, pricing and features, or compare it with {tool.name} side by side.
      </p>

      {/* Main tool summary */}
      <div className="card p-5 mb-8 border-brand/20 bg-brand/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700">
            {tool.logoUrl ? <Image src={tool.logoUrl} alt={tool.name} width={40} height={40} sizes="40px" className="w-10 h-10 object-contain" /> : <span className="text-lg font-bold text-brand">{tool.name.charAt(0)}</span>}
          </div>
          <div className="flex-1">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{tool.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">{tool.tagline}</p>
          </div>
          <Link href={`/tools/${tool.slug}`} className="px-4 py-2 text-sm font-semibold bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors">
            View Tool
          </Link>
        </div>
      </div>

      {/* Alternatives grid */}
      <div className="space-y-4">
        {alternatives.map((alt: any, i: number) => (
          <Link
            key={alt.id}
            href={`/tools/${alt.slug}`}
            className="block card p-5 hover:border-brand/30 hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-4">
              <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 w-7 h-7 rounded-full flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700">
                {alt.logoUrl ? <Image src={alt.logoUrl} alt={alt.name} width={32} height={32} sizes="32px" className="w-8 h-8 object-contain" /> : <span className="text-sm font-bold text-brand">{alt.name.charAt(0)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-sora font-bold text-base text-navy dark:text-white group-hover:text-brand transition-colors">{alt.name}</h3>
                  {alt.avgRating && parseFloat(alt.avgRating) > 0 && (
                    <div className="flex items-center gap-0.5">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs font-bold text-gray-600">{parseFloat(alt.avgRating).toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">{alt.tagline}</p>
                <div className="flex items-center gap-3 mt-2">
                  {alt.categoryName && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{alt.categoryName}</span>}
                  {alt.pricingModel && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 uppercase">{alt.pricingModel}</span>}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-brand transition-colors shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </div>

      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `Best ${tool.name} Alternatives`,
        numberOfItems: alternatives.length,
        itemListElement: alternatives.map((alt: any, i: number) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: { '@type': 'SoftwareApplication', name: alt.name, url: `https://udyaibase.com/tools/${alt.slug}` },
        })),
      }) }} />
    </div>
  );
}

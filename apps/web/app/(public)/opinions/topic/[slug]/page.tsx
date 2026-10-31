import { jsonLd } from "@/lib/json-ld";
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import { getOpinionsDirect, getOpinionTagsDirect, getOpinionCountByTagDirect, sql } from '@/lib/db';
import { generateCollectionPageSchema, generateBreadcrumbSchema } from '@/lib/seo';
import TopicFilterPills from '@/components/opinions/TopicFilterPills';

export const revalidate = 60;

const SITE_URL = 'https://udyaibase.com';
const PER_PAGE = 12;

export async function generateMetadata(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const tagSlug = params.slug;
  const page = parseInt(searchParams.page || '1', 10);

  const tags: any[] = await getOpinionTagsDirect();
  const tag = tags.find((t: any) => t.slug === tagSlug);
  if (!tag) return { title: 'Topic Not Found' };

  const count = await getOpinionCountByTagDirect(tagSlug);
  if (count === 0) return { title: 'Topic Not Found' };

  const canonical = `${SITE_URL}/opinions/topic/${tagSlug}`;
  const noindex = count < 3 || page > 1;

  return {
    title: `${tag.name} Opinions — Udyaibase`,
    description: `Expert opinions and analysis on ${tag.name} from founders, investors, and ecosystem leaders.`,
    alternates: { canonical },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${tag.name} Opinions — Udyaibase`,
      description: `Expert opinions and analysis on ${tag.name}.`,
      type: 'website',
      url: canonical,
      siteName: 'Udyaibase',
      locale: 'en_IN',
    },
    twitter: {
      card: 'summary',
      title: `${tag.name} Opinions — Udyaibase`,
      description: `Expert opinions and analysis on ${tag.name} from founders, investors, and ecosystem leaders.`,
    },
  };
}

export async function generateStaticParams() {
  try {
    const rows = await sql`
      SELECT DISTINCT t.slug
      FROM "Tag" t
      JOIN "Article" a ON a."primaryTagId" = t.id
      WHERE a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
    `;
    return rows.map((r: any) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

export default async function TopicPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const tagSlug = params.slug;
  const page = Math.max(1, parseInt(searchParams.page || '1', 10));
  const offset = (page - 1) * PER_PAGE;

  const [count, tags] = await Promise.all([
    getOpinionCountByTagDirect(tagSlug),
    getOpinionTagsDirect(),
  ]);

  if (count === 0) notFound();

  const tag = (tags as any[]).find((t: any) => t.slug === tagSlug);
  const tagName = tag?.name || tagSlug;

  const articles = await getOpinionsDirect({ tagSlug, limit: PER_PAGE, offset });
  const totalPages = Math.ceil(count / PER_PAGE);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Opinions', url: `${SITE_URL}/opinions` },
    { name: tagName, url: `${SITE_URL}/opinions/topic/${tagSlug}` },
  ]);

  const collectionSchema = generateCollectionPageSchema({
    name: `${tagName} Opinions`,
    description: `Expert opinions and analysis on ${tagName}.`,
    url: `${SITE_URL}/opinions/topic/${tagSlug}`,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />

      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/opinions" className="hover:text-brand">Opinions</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">{tagName}</span>
      </nav>

      <h1 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mb-2">
        {tagName}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mb-6">
        {count} {count === 1 ? 'opinion' : 'opinions'}
      </p>

      <div className="mb-8">
        <TopicFilterPills tags={tags as any[]} activeSlug={tagSlug} />
      </div>

      <div className="relative">
        <div className="absolute -top-10 left-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="absolute top-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="absolute -top-10 right-0 w-px h-10 bg-gradient-to-t from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="absolute top-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="absolute -bottom-10 left-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="absolute bottom-0 -left-10 h-px w-10 bg-gradient-to-l from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="absolute -bottom-10 right-0 w-px h-10 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
        <div className="absolute bottom-0 -right-10 h-px w-10 bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent" />

        <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700">
          {articles.map((a: any, idx: number) => {
            const N = articles.length;
            const borderClass = [
              idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
              idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
              idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : '',
            ].filter(Boolean).join(' ');
            return (
              <Link key={a.slug} href={`/opinions/${a.slug}`} className="group h-full">
                <div className={`bg-gray-50 dark:bg-gray-900 p-5 sm:p-6 relative hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} hover:border-l-4 hover:border-l-red-500 h-full flex flex-col`}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-block text-xs font-bold uppercase tracking-wider text-red-500">Opinion</span>
                    {a.primaryTag && (
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 font-jakarta">{a.primaryTag.name}</span>
                    )}
                  </div>
                  <p className="font-sora font-bold text-base sm:text-lg text-gray-900 dark:text-white leading-tight mb-3 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">
                    {a.title}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 font-jakarta text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
                    {a.excerpt || ''}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 font-jakarta mt-auto">
                    {a.author?.name && <><span>{a.author.name}</span><span>·</span></>}
                    {a.publishedAt && <span>{new Date(a.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                    {a.readTimeMinutes && <><span>·</span><span>{a.readTimeMinutes} min read</span></>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/opinions/topic/${tagSlug}${page > 2 ? `?page=${page - 1}` : ''}`}
              className="px-4 py-2 rounded-lg text-sm font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/opinions/topic/${tagSlug}?page=${page + 1}`}
              className="px-4 py-2 rounded-lg text-sm font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

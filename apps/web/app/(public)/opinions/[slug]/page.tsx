import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, Calendar, ChevronRight, MapPin, Briefcase, Star, ExternalLink } from 'lucide-react';
import { sql, getOpinionBySlugDirect, getRelatedContentForOpinion } from '@/lib/db';
import { generateArticleSchema, generateBreadcrumbSchema, generatePersonSchema } from '@/lib/seo';
import { sanitizeHtml } from '@/lib/sanitize';
import ShareButton from '@/components/ShareButton';
import ArticleActions from '@/components/ArticleActions';
import SubscribeForm from '@/components/SubscribeForm';
import AuthorCard from '@/components/opinions/AuthorCard';
import KeyTakeaways from '@/components/opinions/KeyTakeaways';
import AgreeDisagreeActions from '@/components/opinions/AgreeDisagreeActions';
import OpinionCard from '@/components/opinions/OpinionCard';

export const revalidate = 60;

const SITE_URL = 'https://udyaibase.com';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const article = await getOpinionBySlugDirect(params.slug);
  if (!article) return { title: 'Article Not Found' };

  const canonical = `${SITE_URL}/opinions/${params.slug}`;
  const images = article.coverImage
    ? [{ url: article.coverImage, width: 1200, height: 630, alt: article.title }]
    : [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630 }];

  return {
    title: article.title,
    description: article.excerpt || '',
    alternates: { canonical },
    authors: article.author?.name ? [{ name: article.author.name }] : undefined,
    openGraph: {
      title: article.title,
      description: article.excerpt || '',
      type: 'article',
      url: canonical,
      siteName: 'Udyaibase',
      locale: 'en_IN',
      images,
      ...(article.publishedAt ? { publishedTime: new Date(article.publishedAt).toISOString() } : {}),
      ...(article.updatedAt ? { modifiedTime: new Date(article.updatedAt).toISOString() } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.excerpt || '',
      images: images.map(i => i.url),
    },
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

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

const formatDateShort = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const formatSalary = (min?: number | null, max?: number | null) => {
  if (!min && !max) return null;
  const fmt = (n: number) => n >= 100000 ? `${(n / 100000).toFixed(1)}L` : `${(n / 1000).toFixed(0)}K`;
  if (min && max) return `₹${fmt(min)} – ₹${fmt(max)}`;
  if (min) return `From ₹${fmt(min)}`;
  return `Up to ₹${fmt(max!)}`;
};

export default async function OpinionDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const article = await getOpinionBySlugDirect(params.slug);
  if (!article) notFound();

  const tagIds = [
    ...(article.primaryTag ? [article.primaryTagSlug] : []),
    ...article.secondaryTags.map((t: any) => t.slug),
  ];
  const allTagRows: any[] = await sql`
    SELECT id FROM "Tag" WHERE slug = ANY(${tagIds.length > 0 ? tagIds : ['__none__']}::text[])
  `;
  const allTagIds = allTagRows.map((r: any) => r.id);

  const [relatedContent] = await Promise.all([
    getRelatedContentForOpinion(article.id, allTagIds, article.primaryTagId || null),
  ]);

  const bodyHtml = sanitizeHtml(
    typeof article.content === 'object'
      ? ((article.content as any)?.html || (article.content as any)?.text || article.excerpt || '')
      : String(article.content || article.excerpt || '')
  );

  const articleUrl = `${SITE_URL}/opinions/${article.slug}`;

  const articleSchema = generateArticleSchema({
    title: article.title,
    excerpt: article.excerpt || '',
    author: { name: article.author.name, slug: article.author.slug },
    date: article.publishedAt || article.createdAt,
    updatedAt: article.updatedAt,
    url: articleUrl,
    imageUrl: article.coverImage || undefined,
    category: article.primaryTag?.name || 'Opinion',
    tags: [article.primaryTag?.name, ...article.secondaryTags.map((t: any) => t.name)].filter(Boolean) as string[],
    articleType: 'OPINION',
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Opinions', url: `${SITE_URL}/opinions` },
    ...(article.primaryTag
      ? [{ name: article.primaryTag.name, url: `${SITE_URL}/opinions/topic/${article.primaryTag.slug}` }]
      : []),
    { name: article.title, url: articleUrl },
  ]);

  const personSchema = generatePersonSchema({
    name: article.author.name,
    slug: article.author.slug,
    bio: article.author.bio || undefined,
    role: article.author.role || undefined,
    twitter: article.author.twitter || undefined,
    linkedin: article.author.linkedin || undefined,
  });

  const takeaways: string[] = Array.isArray(article.keyTakeaways) ? article.keyTakeaways : [];

  const { relatedNews, relatedFounderStories, recommendedTools, relevantJobs } = relatedContent;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(personSchema) }} />

      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-6 px-4 sm:px-0">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/opinions" className="hover:text-brand">Opinions</Link>
        {article.primaryTag && (
          <>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/opinions/topic/${article.primaryTag.slug}`} className="hover:text-brand">
              {article.primaryTag.name}
            </Link>
          </>
        )}
      </nav>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <article className="flex-1 min-w-0 max-w-3xl mx-auto lg:mx-0 w-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="badge-brand text-xs">Opinion</span>
            {article.primaryTag && (
              <Link
                href={`/opinions/topic/${article.primaryTag.slug}`}
                className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-jakarta hover:text-brand"
              >
                {article.primaryTag.name}
              </Link>
            )}
          </div>

          <h1 className="font-sora font-extrabold text-[22px] leading-[1.2] sm:text-3xl md:text-[36px] md:leading-[1.2] text-navy dark:text-white">
            {article.title}
          </h1>

          {article.excerpt && (
            <p className="article-lede text-gray-500 dark:text-gray-400 font-jakarta text-sm sm:text-base mt-3 sm:mt-4 leading-relaxed italic">
              {article.excerpt}
            </p>
          )}

          <div className="mt-6 pb-6 border-b border-gray-100 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <AuthorCard author={article.author} />
              <ShareButton title={article.title} />
            </div>
            <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 dark:text-gray-500 font-jakarta">
              {article.publishedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Published {formatDate(article.publishedAt)}
                </span>
              )}
              {article.updatedAt && article.updatedAt !== article.publishedAt && (
                <>
                  <span>·</span>
                  <span>Updated {formatDate(article.updatedAt)}</span>
                </>
              )}
              {article.readTimeMinutes && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{article.readTimeMinutes} min read</span>
                </>
              )}
            </div>
          </div>

          <KeyTakeaways takeaways={takeaways} />

          {article.coverImage && (
            <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-6">
              <Image src={article.coverImage} alt={article.title} fill sizes="100vw" className="object-cover" />
            </div>
          )}

          <div className="article-content prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

          <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/40">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta italic">
              This opinion reflects the author&apos;s personal perspective. It is not Udyaibase&apos;s editorial position.
            </p>
          </div>

          <AgreeDisagreeActions
            slug={article.slug}
            initialAgree={article.agreeCount || 0}
            initialDisagree={article.disagreeCount || 0}
          />

          <ArticleActions
            slug={article.slug}
            initialLikes={article.likeCount || 0}
            title={article.title}
          />

          {/* Related Opinions */}
          {article.related && article.related.length > 0 && (
            <section className="mt-10 sm:mt-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">Related Opinions</h2>
                <Link href="/opinions" className="text-xs font-semibold text-brand hover:underline font-jakarta">View All →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700">
                {article.related.map((r: any, idx: number) => {
                  const N = article.related.length;
                  const borderClass = [
                    idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
                    idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
                    idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <Link key={r.slug} href={`/opinions/${r.slug}`} className="group h-full">
                      <div className={`bg-gray-50 dark:bg-gray-900 p-4 sm:p-5 hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} hover:border-l-4 hover:border-l-red-500 h-full flex flex-col`}>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-red-500 mb-1">Opinion</span>
                        <p className="font-sora font-bold text-sm text-gray-900 dark:text-white leading-snug group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">{r.title}</p>
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400 font-jakarta mt-auto">
                          {r.author?.name && <span>{r.author.name}</span>}
                          {r.publishedAt && <><span>·</span><span>{formatDateShort(r.publishedAt)}</span></>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Related News */}
          {relatedNews.length > 0 && (
            <section className="mt-10 sm:mt-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">Related News</h2>
                <Link href="/news" className="text-xs font-semibold text-brand hover:underline font-jakarta">View All →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700">
                {relatedNews.map((n: any, idx: number) => {
                  const N = relatedNews.length;
                  const borderClass = [
                    idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
                    idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
                    idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <Link key={n.slug} href={`/news/${n.slug}`} className="group h-full">
                      <div className={`bg-gray-50 dark:bg-gray-900 p-4 sm:p-5 hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} hover:border-l-4 hover:border-l-red-500 h-full flex flex-col`}>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500 mb-1">{n.categoryName || 'News'}</span>
                        <p className="font-sora font-bold text-sm text-gray-900 dark:text-white leading-snug group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">{n.title}</p>
                        {n.excerpt && <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs leading-relaxed mt-1.5 line-clamp-2">{n.excerpt}</p>}
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400 font-jakarta mt-auto">
                          {n.authorName && <span>{n.authorName}</span>}
                          {n.publishedAt && <><span>·</span><span>{formatDateShort(n.publishedAt)}</span></>}
                          {n.readTimeMinutes && <><span>·</span><span>{n.readTimeMinutes}m</span></>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Related Founder Stories */}
          {relatedFounderStories.length > 0 && (
            <section className="mt-10 sm:mt-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">Related Founder Stories</h2>
                <Link href="/founder-stories" className="text-xs font-semibold text-brand hover:underline font-jakarta">View All →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-200 dark:border-gray-700">
                {relatedFounderStories.map((s: any, idx: number) => {
                  const N = relatedFounderStories.length;
                  const borderClass = [
                    idx < N - 1 ? 'border-b border-gray-200 dark:border-gray-700' : '',
                    idx >= N - (N % 2 === 0 ? 2 : 1) ? 'sm:border-b-0' : '',
                    idx % 2 === 0 ? 'sm:border-r border-gray-200 dark:border-gray-700' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <Link key={s.slug} href={`/news/${s.slug}`} className="group h-full">
                      <div className={`bg-gray-50 dark:bg-gray-900 p-4 sm:p-5 hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 ${borderClass} hover:border-l-4 hover:border-l-red-500 h-full flex flex-col`}>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-500 mb-1">Founder Story</span>
                        <p className="font-sora font-bold text-sm text-gray-900 dark:text-white leading-snug group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors line-clamp-2">{s.title}</p>
                        {s.excerpt && <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs leading-relaxed mt-1.5 line-clamp-2">{s.excerpt}</p>}
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400 font-jakarta mt-auto">
                          {(s.founderName || s.authorName) && <span>{s.founderName || s.authorName}</span>}
                          {s.founderCompany && <><span>at</span><span className="font-medium">{s.founderCompany}</span></>}
                          {s.publishedAt && <><span>·</span><span>{formatDateShort(s.publishedAt)}</span></>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Recommended Tools */}
          {recommendedTools.length > 0 && (
            <section className="mt-10 sm:mt-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">Recommended Tools</h2>
                <Link href="/tools" className="text-xs font-semibold text-brand hover:underline font-jakarta">View All →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recommendedTools.map((tool: any) => (
                  <Link key={tool.slug} href={`/tools/${tool.slug}`} className="group card p-4 flex items-start gap-3 hover:border-brand/30 transition-all">
                    {tool.logoUrl ? (
                      <Image src={tool.logoUrl} alt={tool.name} width={40} height={40} className="rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center text-brand font-bold text-sm font-sora shrink-0">
                        {tool.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors truncate">{tool.name}</span>
                        {tool.avgRating > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-amber-500 font-jakarta shrink-0">
                            <Star className="w-3 h-3 fill-current" />{tool.avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {tool.tagline && <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta line-clamp-1 mt-0.5">{tool.tagline}</p>}
                      <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1 font-jakarta">{tool.pricingModel?.replace('_', ' ')}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-brand transition-colors shrink-0 mt-1" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Relevant Jobs */}
          {relevantJobs.length > 0 && (
            <section className="mt-10 sm:mt-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">Relevant Jobs</h2>
                <Link href="/jobs" className="text-xs font-semibold text-brand hover:underline font-jakarta">View All →</Link>
              </div>
              <div className="space-y-2">
                {relevantJobs.map((job: any) => (
                  <Link key={job.id} href={`/jobs/${job.slug}`} className="group card p-4 flex items-center gap-3 hover:border-brand/30 transition-all">
                    {job.companyLogo ? (
                      <Image src={job.companyLogo} alt={job.companyName} width={36} height={36} className="rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand font-bold text-xs font-sora shrink-0">
                        {job.companyName?.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors truncate">{job.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 font-jakarta">
                        <span className="font-medium text-gray-500 dark:text-gray-400">{job.companyName}</span>
                        {job.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{job.location}</span>}
                        {job.type && <span className="flex items-center gap-0.5"><Briefcase className="w-3 h-3" />{job.type.replace('_', ' ')}</span>}
                      </div>
                      {formatSalary(job.salaryRangeMin, job.salaryRangeMax) && (
                        <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 font-jakarta">{formatSalary(job.salaryRangeMin, job.salaryRangeMax)}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>

        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6 px-4 sm:px-0">
          {article.secondaryTags.length > 0 && (
            <div className="card p-5">
              <h4 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">Topics</h4>
              <div className="flex flex-wrap gap-2">
                {[article.primaryTag, ...article.secondaryTags].filter(Boolean).map((t: any) => (
                  <Link
                    key={t.slug}
                    href={`/opinions/topic/${t.slug}`}
                    className="px-3 py-1 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand hover:text-white transition-colors"
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {(article.linkedTool || article.linkedStartup) && (
            <div className="card p-5">
              <h4 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">Mentioned</h4>
              {article.linkedTool && (
                <Link href={`/tools/${article.linkedTool.slug}`} className="block hover:opacity-80 transition-opacity mb-2">
                  <span className="text-sm font-semibold text-navy dark:text-white font-jakarta">{article.linkedTool.name}</span>
                  {article.linkedTool.tagline && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">{article.linkedTool.tagline}</p>
                  )}
                </Link>
              )}
              {article.linkedStartup && (
                <Link href={`/startups/${article.linkedStartup.slug}`} className="block hover:opacity-80 transition-opacity">
                  <span className="text-sm font-semibold text-navy dark:text-white font-jakarta">{article.linkedStartup.name}</span>
                </Link>
              )}
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

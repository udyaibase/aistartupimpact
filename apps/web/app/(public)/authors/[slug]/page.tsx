import { jsonLd } from "@/lib/json-ld";
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Clock } from 'lucide-react';
import { getAuthorBySlugDirect } from '@/lib/db';
import { generatePersonSchema, generateBreadcrumbSchema } from '@/lib/seo';

export const revalidate = 120;

// Pages are built on first visit and then cached (no list at build time); refreshed when content changes.
export async function generateStaticParams() {
  return [];
}

const SITE_URL = 'https://udyaibase.com';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const author = await getAuthorBySlugDirect(params.slug);
  if (!author) return { title: 'Author Not Found' };

  const canonical = `${SITE_URL}/authors/${params.slug}`;
  const description = author.bio || `Articles by ${author.name} on Udyaibase.`;

  return {
    title: `${author.name} — Udyaibase`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${author.name} — Udyaibase`,
      description,
      type: 'profile',
      url: canonical,
      ...(author.avatar ? { images: [{ url: author.avatar, width: 200, height: 200 }] } : {}),
    },
    twitter: {
      card: 'summary',
      title: `${author.name} — Udyaibase`,
      description,
    },
  };
}

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default async function AuthorPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const author = await getAuthorBySlugDirect(params.slug);
  if (!author) notFound();

  const personSchema = generatePersonSchema({
    name: author.name,
    slug: author.slug,
    bio: author.bio || undefined,
    role: author.role || undefined,
    twitter: author.twitter || undefined,
    linkedin: author.linkedin || undefined,
    website: author.website || undefined,
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Authors', url: `${SITE_URL}/authors` },
    { name: author.name, url: `${SITE_URL}/authors/${author.slug}` },
  ]);

  const initials = author.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);
  const roleText = [author.role, author.company].filter(Boolean).join(' at ');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(personSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-8">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/opinions" className="hover:text-brand">Opinions</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">{author.name}</span>
      </nav>

      <div className="flex items-start gap-5 mb-8">
        {author.avatar ? (
          <Image src={author.avatar} alt={author.name} width={80} height={80} className="rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-brand font-bold font-sora text-2xl shrink-0">
            {initials}
          </div>
        )}
        <div>
          <h1 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">{author.name}</h1>
          {roleText && <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">{roleText}</p>}
          {author.bio && <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta mt-2 leading-relaxed">{author.bio}</p>}
          {(author.twitter || author.linkedin) && (
            <div className="flex items-center gap-3 mt-3">
              {author.twitter && (
                <a href={author.twitter} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline font-jakarta">
                  Twitter
                </a>
              )}
              {author.linkedin && (
                <a href={author.linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline font-jakarta">
                  LinkedIn
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {author.topics && author.topics.length > 0 && (
        <div className="mb-6">
          <h2 className="font-sora font-bold text-sm text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Topics</h2>
          <div className="flex flex-wrap gap-2">
            {author.topics.map((t: any) => (
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

      <h2 className="section-title mb-4">Articles ({author.articles.length})</h2>
      <div className="space-y-4">
        {author.articles.map((a: any) => (
          <Link
            key={a.slug}
            href={a.type === 'OPINION' ? `/opinions/${a.slug}` : `/news/${a.slug}`}
            className="group block card p-5"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${a.type === 'OPINION' ? 'bg-brand/10 text-brand' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                {a.type === 'OPINION' ? 'Opinion' : a.type === 'NEWS' ? 'News' : a.type}
              </span>
              {a.primaryTag && (
                <span className="text-xs text-gray-400 dark:text-gray-500 font-jakarta uppercase tracking-wider">{a.primaryTag.name}</span>
              )}
            </div>
            <h3 className="font-sora font-bold text-base text-navy dark:text-white group-hover:text-brand transition-colors leading-snug line-clamp-2">
              {a.title}
            </h3>
            {a.excerpt && (
              <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1 line-clamp-2">{a.excerpt}</p>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 font-jakarta">
              {a.publishedAt && <span>{formatDate(a.publishedAt)}</span>}
              {a.readTimeMinutes && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{a.readTimeMinutes} min</span>
                </>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Metadata } from 'next';
import { sql } from '@/lib/db';
import { jsonLd } from '@/lib/json-ld';
import { generateBreadcrumbSchema, generateCollectionPageSchema, generateItemListSchema } from '@/lib/seo';
import { parseDirectoryQuery, searchDirectory } from '@/lib/startups/directory';
import { Suspense } from 'react';
import FounderActionButton from '@/components/auth/FounderActionButton';

const StartupSearch = dynamic(() => import('@/components/StartupSearch'));

// Admin and founder edits refresh this page on demand (lib/revalidate.ts); the timer is a fallback.
export const revalidate = 300;

/** Rounded down so the "+" stays true (816 → "810+"). */
const roundedCount = (n: number) => (n >= 100 ? `${Math.floor(n / 10) * 10}+` : n > 0 ? `${n}` : '');

// The description used to claim "1000+" startups; the count is now live.
export async function generateMetadata(): Promise<Metadata> {
  const n = roundedCount(await getDirectorySize());
  return {
    title: `AI Startup Directory — ${n ? `${n} ` : ''}Indian & Global AI Startups`,
    description: `Browse ${n ? `${n} ` : ''}AI startups by sector, funding stage and city — Bengaluru, Mumbai, Delhi NCR, Hyderabad and beyond. See founders, funding rounds and what each startup builds.`,
    alternates: { canonical: 'https://udyaibase.com/startups' },
    openGraph: { title: 'AI Startup Directory', url: 'https://udyaibase.com/startups', type: 'website', images: [{ url: '/og-image.webp', width: 2250, height: 1181 }] },
  };
}

/** Size of the whole directory for the heading — independent of any search or filter in the URL. */
async function getDirectorySize() {
  try {
    const rows = await sql`SELECT COUNT(*)::int AS n FROM "Startup" WHERE "deletedAt" IS NULL AND "isApproved" = true`;
    return Number((rows[0] as any)?.n ?? 0);
  } catch {
    return 0;
  }
}

async function getUniqueCities() {
  try {
    const rows = await sql`
      SELECT "headquartersCity" AS city, COUNT(*) as count
      FROM "Startup"
      WHERE "deletedAt" IS NULL 
        AND "isApproved" = true 
        AND "headquartersCity" IS NOT NULL 
        AND "headquartersCity" != ''
      GROUP BY "headquartersCity"
      ORDER BY count DESC
      LIMIT 20
    `;
    return rows.map((r: any) => r.city);
  } catch (e) {
    console.error('getUniqueCities error:', e);
    return ['Bengaluru', 'Mumbai', 'Delhi', 'Gurugram', 'Noida', 'Hyderabad', 'Pune', 'Chennai'];
  }
}

// Rendered without the URL's filters so the page can be cached; StartupSearch applies them after load.
export default async function StartupsPage() {
  const [cities, directorySize, initial] = await Promise.all([
    getUniqueCities(),
    getDirectorySize(),
    searchDirectory({ ...parseDirectoryQuery(() => undefined), page: 1, limit: 30 }).catch((e) => {
      console.error('startups directory error:', e instanceof Error ? e.message : e);
      return { startups: [], total: 0, counts: { all: 0, funded: 0, unfunded: 0 }, understood: null, funding: null };
    }),
  ]);
  const total = initial.total ?? 0;
  const counts = initial.counts ?? { all: total, funded: 0, unfunded: 0 };

  const pageUrl = 'https://udyaibase.com/startups';
  const collectionSchema = generateCollectionPageSchema({
    name: 'AI Startup Directory',
    description: 'AI startups by sector, funding stage and city, with founders and funding rounds.',
    url: pageUrl,
  });
  const listed = ((initial.startups ?? []) as any[]).slice(0, 30);
  const itemListSchema = listed.length
    ? generateItemListSchema({
        name: 'AI Startups',
        description: 'AI startups listed on Udyaibase.',
        url: pageUrl,
        items: listed.map((st, i) => ({ position: i + 1, name: String(st.name).trim(), url: `${pageUrl}/${st.slug}`, description: st.tagline || undefined })),
      })
    : null;
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: 'https://udyaibase.com' },
    { name: 'AI Startups', url: pageUrl },
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:py-10 pb-24 sm:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {itemListSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }} />}
      <div className="mb-3 sm:mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-sora font-bold sm:font-extrabold text-[22px] sm:text-3xl md:text-4xl text-navy dark:text-white leading-[1.2] sm:leading-tight tracking-tight">
            Discover AI startups.{' '}
            <span className="text-brand">Before everyone else.</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-[13px] sm:text-sm leading-snug sm:leading-normal max-w-2xl mt-1 sm:mt-2">
            Browse {directorySize || counts.all}+ startups by sector, stage, and city — from bootstrapped to Series C, across the globe.
          </p>
        </div>
        <FounderActionButton
          href="/founder/startups/new"
          className="border border-brand text-brand bg-brand/5 hover:bg-brand/10 px-4 sm:px-5 py-2.5 rounded-xl font-semibold sm:font-bold font-jakarta text-sm transition-colors whitespace-nowrap text-center shrink-0"
        >
          + Add Startup
        </FounderActionButton>
      </div>

      <Suspense fallback={<div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />}>
        <StartupSearch
          initialStartups={initial.startups as any}
          initialTotal={total}
          initialCounts={counts}
          initialUnderstood={initial.understood}
          initialFunding={initial.funding as any}
          cities={cities}
        />
      </Suspense>
    </div>
  );
}

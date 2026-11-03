import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Metadata } from 'next';
import { sql } from '@/lib/db';
import { parseDirectoryQuery, searchDirectory } from '@/lib/startups/directory';
import { Suspense } from 'react';
import FounderActionButton from '@/components/auth/FounderActionButton';

const StartupSearch = dynamic(() => import('@/components/StartupSearch'));

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Indian AI Startup Directory — Browse & Discover',
  description: 'Browse 1000+ Indian AI startups. Filter by funding, stage and city, or search by name.',
  alternates: { canonical: 'https://udyaibase.com/startups' },
};

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

export default async function StartupsPage(
  props: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const query = parseDirectoryQuery((key) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  });
  // The first page always starts at page 1, whatever the URL says.
  const [cities, directorySize, initial] = await Promise.all([
    getUniqueCities(),
    getDirectorySize(),
    searchDirectory({ ...query, page: 1, limit: 30 }).catch((e) => {
      console.error('startups directory error:', e instanceof Error ? e.message : e);
      return { startups: [], total: 0, counts: { all: 0, funded: 0, unfunded: 0 }, understood: null, funding: null };
    }),
  ]);
  const total = initial.total ?? 0;
  const counts = initial.counts ?? { all: total, funded: 0, unfunded: 0 };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-24 sm:pb-10">
      <div className="mb-5 sm:mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-sora font-extrabold text-xl sm:text-3xl md:text-4xl text-navy dark:text-white leading-tight tracking-tight">
            Discover AI startups.{' '}
            <span className="text-brand">Before everyone else.</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs sm:text-sm max-w-2xl mt-1.5 sm:mt-2">
            Browse {directorySize || counts.all}+ startups by sector, stage, and city — from bootstrapped to Series C, across the globe.
          </p>
        </div>
        <FounderActionButton
          href="/founder/startups/new"
          className="border border-brand text-brand bg-brand/5 hover:bg-brand/10 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold font-jakarta text-xs sm:text-sm transition-colors whitespace-nowrap text-center shrink-0"
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

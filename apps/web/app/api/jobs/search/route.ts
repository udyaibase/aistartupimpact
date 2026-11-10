import { NextRequest, NextResponse } from 'next/server';
import { searchJobs, JOB_SEARCH_KEYS, type JobSearchFilters } from '@/lib/jobs/search';

export const dynamic = 'force-dynamic';

/** Filtered pages for the /jobs list (the page itself is cached without filters). ?limit is capped at 100. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters: JobSearchFilters = {};
  for (const key of JOB_SEARCH_KEYS) filters[key] = sp.get(key);

  try {
    const { jobs, total } = await searchJobs(filters, {
      limit: Number(sp.get('limit')) || undefined,
      offset: Math.min(Number(sp.get('offset')) || 0, 10_000),
    });
    return NextResponse.json(
      { jobs, total },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch (e) {
    console.error('job search error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

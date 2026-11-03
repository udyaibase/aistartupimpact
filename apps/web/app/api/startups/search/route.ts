import { NextRequest, NextResponse } from 'next/server';
import { parseDirectoryQuery, searchDirectory } from '@/lib/startups/directory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = parseDirectoryQuery((key) => req.nextUrl.searchParams.get(key));

  try {
    const { startups, total, counts, understood, funding } = await searchDirectory(query);
    return NextResponse.json(
      {
        startups,
        page: query.page,
        understood,
        funding,
        // Totals are only computed for page 1; later pages keep the ones the client already has.
        ...(total != null && { total, pages: Math.ceil(total / query.limit), counts }),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
    );
  } catch (e) {
    console.error('startup search error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

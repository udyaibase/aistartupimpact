import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // Bounded whole numbers: they go into the query as parameters.
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 90);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10', 10) || 10, 1), 50);

    // Get popular searches from the last N days
    const popularSearches = await sql`
      SELECT 
        "normalizedQuery" as query,
        COUNT(*) as "searchCount",
        COUNT(DISTINCT "sessionId") as "uniqueUsers",
        MAX("createdAt") as "lastSearchedAt"
      FROM "SearchQuery"
      WHERE "createdAt" >= NOW() - make_interval(days => ${days}::int)
      GROUP BY "normalizedQuery"
      HAVING COUNT(*) >= 2
      ORDER BY "searchCount" DESC, "uniqueUsers" DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      popular: popularSearches.map((s: any) => ({
        query: s.query,
        searchCount: parseInt(s.searchCount),
        uniqueUsers: parseInt(s.uniqueUsers),
        lastSearchedAt: s.lastSearchedAt,
      })),
      period: `${days} days`,
    });

  } catch (error) {
    console.error('Popular searches API error:', error);
    return NextResponse.json(
      { popular: [], error: 'Failed to fetch popular searches' },
      { status: 500 }
    );
  }
}

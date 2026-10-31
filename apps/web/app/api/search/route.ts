import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
// Normalize search query for analytics
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Generate session ID from request
function getSessionId(request: NextRequest): string {
  const ip = clientIp(request);
  const ua = request.headers.get('user-agent') || 'unknown';
  return Buffer.from(`${ip}-${ua}`).toString('base64').substring(0, 32);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const type = searchParams.get('type'); // 'all', 'articles', 'tools', 'startups'
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ 
        results: [], 
        total: 0,
        page,
        limit,
        hasMore: false
      });
    }

    const searchTerm = query.trim();
    const normalizedQuery = normalizeQuery(searchTerm);
    const sessionId = getSessionId(request);

    // Convert search term to tsquery format (handle multi-word searches)
    const tsQuery = searchTerm
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => `${word}:*`)
      .join(' & ');

    // Parallel search across all content types with full-text search and ranking
    const searchPromises: Promise<any>[] = [];

    // Search Articles (if type is 'all' or 'articles')
    if (!type || type === 'all' || type === 'articles') {
      searchPromises.push(
        sql`
          SELECT 
            id,
            title,
            slug,
            excerpt,
            type,
            "coverImage",
            "publishedAt",
            "readTimeMinutes",
            (SELECT name FROM "Category" WHERE id = "Article"."categoryId") as category,
            ts_rank("searchVector", to_tsquery('english', ${tsQuery})) as rank,
            'article' as result_type
          FROM "Article"
          WHERE 
            status = 'PUBLISHED'
            AND "searchVector" @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC, "publishedAt" DESC
          LIMIT ${type === 'articles' ? limit : 10}
          OFFSET ${type === 'articles' ? offset : 0}
        `.catch(() => [])
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    // Search Tools (if type is 'all' or 'tools')
    if (!type || type === 'all' || type === 'tools') {
      searchPromises.push(
        sql`
          SELECT 
            id,
            name as title,
            slug,
            tagline as excerpt,
            "logoUrl",
            "pricingModel",
            "avgRating",
            "reviewCount",
            (SELECT name FROM "ToolCategory" WHERE id = "AiTool"."categoryId") as category,
            ts_rank("searchVector", to_tsquery('english', ${tsQuery})) as rank,
            'tool' as result_type
          FROM "AiTool"
          WHERE 
            status = 'APPROVED'
            AND "searchVector" @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC, "avgRating" DESC, "reviewCount" DESC
          LIMIT ${type === 'tools' ? limit : 10}
          OFFSET ${type === 'tools' ? offset : 0}
        `.catch(() => [])
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    // Search Startups (if type is 'all' or 'startups')
    if (!type || type === 'all' || type === 'startups') {
      searchPromises.push(
        sql`
          SELECT 
            id,
            name as title,
            slug,
            tagline as excerpt,
            "logoUrl",
            stage,
            "totalFundingInr",
            "impactScore",
            ts_rank("searchVector", to_tsquery('english', ${tsQuery})) as rank,
            'startup' as result_type
          FROM "Startup"
          WHERE 
            "searchVector" @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC, "impactScore" DESC
          LIMIT ${type === 'startups' ? limit : 10}
          OFFSET ${type === 'startups' ? offset : 0}
        `.catch(() => [])
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    const [articles, tools, startups] = await Promise.all(searchPromises);

    // Combine and sort results by relevance rank
    let results: any[] = [];
    
    if (type && type !== 'all') {
      // Single type search - return as is
      results = type === 'articles' ? articles : type === 'tools' ? tools : startups;
    } else {
      // Combined search - merge and sort by rank
      results = [...articles, ...tools, ...startups]
        .sort((a, b) => parseFloat(b.rank) - parseFloat(a.rank))
        .slice(0, limit);
    }

    // Format results
    const formattedResults = results.map((item: any) => ({
      id: item.id,
      type: item.result_type,
      title: item.title,
      slug: item.slug,
      excerpt: item.excerpt,
      category: item.category,
      logoUrl: item.logoUrl || item.coverImage,
      coverImage: item.coverImage,
      publishedAt: item.publishedAt,
      readTimeMinutes: item.readTimeMinutes,
      pricingModel: item.pricingModel,
      avgRating: item.avgRating,
      reviewCount: item.reviewCount,
      stage: item.stage,
      totalFundingInr: item.totalFundingInr,
      impactScore: item.impactScore,
      rank: parseFloat(item.rank),
    }));

    const total = formattedResults.length;

    // Log search query for analytics (async, don't wait)
    sql`
      INSERT INTO "SearchQuery" (
        query, 
        "normalizedQuery", 
        "resultsCount", 
        "sessionId",
        "ipAddress",
        "userAgent"
      )
      VALUES (
        ${searchTerm},
        ${normalizedQuery},
        ${total},
        ${sessionId},
        ${clientIp(request)},
        ${request.headers.get('user-agent')}
      )
    `.catch(err => console.error('Failed to log search query:', err));

    return NextResponse.json({
      results: formattedResults,
      total,
      page,
      limit,
      hasMore: total >= limit,
      query: searchTerm,
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { 
        results: [], 
        total: 0,
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

// Track search result clicks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, resultId, resultType } = body;

    if (!query || !resultId || !resultType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const normalizedQuery = normalizeQuery(query);
    const sessionId = getSessionId(request);

    // Update search query with clicked result
    await sql`
      INSERT INTO "SearchQuery" (
        query,
        "normalizedQuery",
        "resultsCount",
        "clickedResultId",
        "clickedResultType",
        "sessionId",
        "ipAddress",
        "userAgent"
      )
      VALUES (
        ${query},
        ${normalizedQuery},
        1,
        ${resultId},
        ${resultType},
        ${sessionId},
        ${clientIp(request)},
        ${request.headers.get('user-agent')}
      )
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Search click tracking error:', error);
    return NextResponse.json({ error: 'Failed to track click' }, { status: 500 });
  }
}

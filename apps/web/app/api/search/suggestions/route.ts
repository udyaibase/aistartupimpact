import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
// Popular search suggestions (fallback)
const POPULAR_SUGGESTIONS = [
  'ChatGPT',
  'Midjourney',
  'Stable Diffusion',
  'AI tools',
  'Machine learning',
  'Generative AI',
  'AI startups India',
  'Funding news',
];

export async function GET(request: NextRequest) {
  // Called as people type, so the limit is per visitor per minute, same as other API reads.
  const { success: allowed, reset } = await checkRateLimit(apiRateLimit, `search-suggest:${getClientIdentifier(request)}`);
  if (!allowed) return NextResponse.json({ error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.slice(0, 100) ?? null;

    if (!query || query.trim().length < 2) {
      // Return popular searches when no query
      const popularSearches = await sql`
        SELECT 
          "normalizedQuery" as suggestion,
          COUNT(*) as count
        FROM "SearchQuery"
        WHERE "createdAt" >= NOW() - INTERVAL '7 days'
        GROUP BY "normalizedQuery"
        HAVING COUNT(*) >= 2
        ORDER BY count DESC
        LIMIT 8
      `.catch(() => []);

      const suggestions = popularSearches.length > 0
        ? popularSearches.map((s: any) => s.suggestion)
        : POPULAR_SUGGESTIONS;

      return NextResponse.json({ suggestions });
    }

    const searchTerm = query.trim().toLowerCase();

    // Get suggestions from multiple sources in parallel
    const [
      recentSearches,
      articleTitles,
      toolNames,
      startupNames,
    ] = await Promise.all([
      // Recent popular searches matching the query
      sql`
        SELECT DISTINCT "normalizedQuery" as suggestion
        FROM "SearchQuery"
        WHERE 
          "normalizedQuery" ILIKE ${searchTerm + '%'}
          AND "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY "normalizedQuery"
        HAVING COUNT(*) >= 2
        ORDER BY COUNT(*) DESC
        LIMIT 3
      `.catch(() => []),

      // Article titles
      sql`
        SELECT title as suggestion
        FROM "Article"
        WHERE 
          status = 'PUBLISHED'
          AND title ILIKE ${searchTerm + '%'}
        ORDER BY "publishedAt" DESC
        LIMIT 3
      `.catch(() => []),

      // Tool names
      sql`
        SELECT name as suggestion
        FROM "AiTool"
        WHERE 
          status = 'APPROVED'
          AND name ILIKE ${searchTerm + '%'}
        ORDER BY "avgRating" DESC, "reviewCount" DESC
        LIMIT 3
      `.catch(() => []),

      // Startup names
      sql`
        SELECT name as suggestion
        FROM "Startup"
        WHERE name ILIKE ${searchTerm + '%'}
        ORDER BY "impactScore" DESC
        LIMIT 3
      `.catch(() => []),
    ]);

    // Combine and deduplicate suggestions
    const allSuggestions = [
      ...recentSearches,
      ...articleTitles,
      ...toolNames,
      ...startupNames,
    ].map((s: any) => s.suggestion);

    // Remove duplicates (case-insensitive)
    const uniqueSuggestions = Array.from(
      new Set(allSuggestions.map(s => s.toLowerCase()))
    ).slice(0, 8);

    // If no suggestions found, return popular searches
    const suggestions = uniqueSuggestions.length > 0
      ? uniqueSuggestions
      : POPULAR_SUGGESTIONS.filter(s => 
          s.toLowerCase().includes(searchTerm)
        ).slice(0, 8);

    return NextResponse.json({ suggestions });

  } catch (error) {
    console.error('Suggestions API error:', error);
    return NextResponse.json(
      { suggestions: POPULAR_SUGGESTIONS.slice(0, 5) },
      { status: 200 } // Return fallback suggestions instead of error
    );
  }
}

import { NextResponse } from 'next/server';
import { getDirectoryToolsDirect, getToolTagMappingsDirect, getToolTagGroupsForFilterDirect } from '@/lib/db';
import { encodeDirectory } from '@/lib/tools/directory-wire';

// The full /tools list, loaded by the browser only when someone filters, searches or scrolls past the first tools.
// Cached at the edge; refreshed with the tools section (lib/revalidate.ts) and at most every 5 minutes.
export const revalidate = 300;

export async function GET() {
  const [tools, tagMap, tagGroups] = await Promise.all([
    getDirectoryToolsDirect(), getToolTagMappingsDirect(), getToolTagGroupsForFilterDirect(),
  ]);
  const ids = new Set(tools.map((t: any) => t.id));
  const slim = tools.map((t: any) => ({
    id: t.id, slug: t.slug, name: t.name, tagline: t.tagline, logoUrl: t.logoUrl,
    category: t.category, categorySlug: t.categorySlug, parentCategory: t.parentCategory, parentCategorySlug: t.parentCategorySlug,
    rating: t.rating, pricing: t.pricing, verdict: t.verdict, hasApi: t.hasApi, hasMobileApp: t.hasMobileApp,
    freeTrialDays: t.freeTrialDays, upvoteCount: t.upvoteCount, launchYear: t.launchYear, country: t.country,
    founderNames: t.founderNames,
  }));
  // Only mappings for listed tools (the full table also covers unapproved ones).
  const toolTagMap: Record<string, string[]> = {};
  for (const [id, tags] of Object.entries(tagMap)) if (ids.has(id)) toolTagMap[id] = tags;

  return NextResponse.json(
    // Compact format (lib/tools/directory-wire.ts): about half the size of the plain JSON.
    encodeDirectory({ tools: slim, toolTagMap, tagGroups: tagGroups as any }),
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}

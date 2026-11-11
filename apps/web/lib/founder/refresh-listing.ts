import { prisma } from '@udyaibase/database';
import { CK, invalidateCache } from '@/lib/cache';
import { refreshPaths } from '@/lib/revalidate';

/**
 * Public startup and tool pages are cached for an hour, so a change a founder makes (an edit that goes live, a
 * domain verification) refreshes that one page and its cached data straight away instead of waiting for the timer.
 * Never throws: a refresh must not break the save that called it.
 */
export async function refreshPublicListing(type: 'startup' | 'tool', id: string): Promise<void> {
  try {
    if (type === 'startup') {
      const row = await prisma.startup.findUnique({ where: { id }, select: { slug: true } });
      if (row?.slug) refreshPaths([`/startups/${row.slug}`]);
      return;
    }
    const row = await prisma.aiTool.findUnique({ where: { id }, select: { slug: true } });
    if (!row?.slug) return;
    await invalidateCache(CK.tool(row.slug), CK.toolTags(id), CK.toolProsCons(id));
    refreshPaths([`/tools/${row.slug}`, `/tools/alternatives/${row.slug}`]);
  } catch (err) {
    console.warn('[refreshPublicListing] skipped:', err instanceof Error ? err.message : err);
  }
}

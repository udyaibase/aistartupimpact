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

/**
 * A founder posted, edited or deleted an update, story or milestone: refresh the pages that show it. Updates and
 * milestones appear on the startup's own profile only; stories also appear on the Founder Stories page. Story pages are
 * cached for an hour, so without this a deleted update stayed public until the timer ran out.
 */
export async function refreshPublicContent(startupId: string | null, articleSlug?: string | null): Promise<void> {
  try {
    const paths = ['/stories'];
    // Older links to an update point at /news/<slug>; that address has its own cached copy.
    if (articleSlug) paths.push(`/stories/${articleSlug}`, `/news/${articleSlug}`);
    if (startupId) {
      const row = await prisma.startup.findUnique({ where: { id: startupId }, select: { slug: true } });
      if (row?.slug) paths.push(`/startups/${row.slug}`);
    }
    refreshPaths(paths);
  } catch (err) {
    console.warn('[refreshPublicContent] skipped:', err instanceof Error ? err.message : err);
  }
}

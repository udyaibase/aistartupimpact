import { permanentRedirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { articlePath } from '@/lib/seo';

/**
 * An article whose URL was changed keeps its old links: when nothing lives at `slug`, send the reader (and Google,
 * with a permanent redirect) to the published article that used to. Returns when there is none, so the caller
 * shows its usual "not found".
 */
export async function redirectOldArticleSlug(slug: string): Promise<void> {
  let hit: { slug: string; type: string } | undefined;
  try {
    const rows = (await sql`
      SELECT slug, type::text AS type FROM "Article"
      WHERE ${slug} = ANY("previousSlugs") AND status = 'PUBLISHED' AND "deletedAt" IS NULL
      ORDER BY "updatedAt" DESC LIMIT 1`) as Array<{ slug: string; type: string }>;
    hit = rows[0];
  } catch {
    return; // lookup unavailable (for example the column is not there yet): behave as before
  }
  if (hit && hit.slug !== slug) permanentRedirect(articlePath(hit.type, hit.slug));
}

import { sql } from '@/lib/db';

/**
 * Rules for a founder choosing a new public URL for a startup or tool.
 */

/** Words that are pages of the site itself under /startups or /tools, or would be confusing as a listing URL. */
export const RESERVED_SLUGS = new Set([
  'new', 'submit', 'claim', 'edit', 'category', 'categories', 'compare', 'alternatives', 'search', 'sitemap',
  'admin', 'api', 'login', 'signup', 'settings', 'founder', 'employer', 'organizer', 'udyaibase',
]);

export function slugFormatProblem(slug: unknown): string | null {
  if (typeof slug !== 'string' || slug.length < 3) return 'URL must be at least 3 characters';
  if (slug.length > 80) return 'URL must be under 80 characters';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'URL can only contain lowercase letters, numbers, and hyphens';
  if (RESERVED_SLUGS.has(slug)) return 'That URL is reserved. Try a different one.';
  return null;
}

/**
 * True when another startup or tool uses this URL now, or used it before. Old URLs keep redirecting to the listing
 * that moved, so letting someone else take one would hand them that listing's old links.
 * A listing may take back its own old URL.
 */
export async function slugTakenByAnother(slug: string, self: { type: 'startup' | 'tool'; id: string }): Promise<boolean> {
  const startupSelf = self.type === 'startup' ? self.id : '';
  const toolSelf = self.type === 'tool' ? self.id : '';
  const [startups, tools] = await Promise.all([
    sql`SELECT id FROM "Startup" WHERE (slug = ${slug} OR ${slug} = ANY("previousSlugs")) AND id != ${startupSelf} LIMIT 1`,
    sql`SELECT id FROM "AiTool" WHERE (slug = ${slug} OR ${slug} = ANY("previousSlugs")) AND id != ${toolSelf} LIMIT 1`,
  ]);
  return startups.length > 0 || tools.length > 0;
}

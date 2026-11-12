import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { compareHref } from '@/lib/tools/compare-slug';
import { isBuildPhase } from '@/lib/build-fallback';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const pairs = await sql`
      SELECT a.slug as slug_a, b.slug as slug_b, GREATEST(a."updatedAt", b."updatedAt") as "lastModified"
      FROM "AiTool" a
      JOIN "AiTool" b ON a."categoryId" = b."categoryId" AND a.id < b.id
      WHERE (a.status = 'APPROVED' OR a.status = 'FEATURED') AND a."deletedAt" IS NULL
        AND (b.status = 'APPROVED' OR b.status = 'FEATURED') AND b."deletedAt" IS NULL
      ORDER BY "lastModified" DESC
      LIMIT 2000
    `;

    return (pairs as any[]).map((p) => ({
      url: `${SITE_URL}${compareHref([p.slug_a, p.slug_b])}`,
      lastModified: new Date(p.lastModified),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch (error) {
    console.error('Error generating compare sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [];
  }
}

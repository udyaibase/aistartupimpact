import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { isBuildPhase } from '@/lib/build-fallback';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const [users, founders] = await Promise.all([
      sql`
        SELECT DISTINCT u.slug, MAX(a."updatedAt") as "lastModified"
        FROM "User" u
        JOIN "Article" a ON a."authorId" = u.id
        WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL AND u.slug IS NOT NULL
        GROUP BY u.slug
      `,
      sql`
        SELECT DISTINCT fu.id, MAX(a."updatedAt") as "lastModified"
        FROM "FounderUser" fu
        JOIN "Article" a ON a."founderAuthorId" = fu.id
        WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        GROUP BY fu.id
      `,
    ]);

    const userRoutes: MetadataRoute.Sitemap = (users as any[]).map((u) => ({
      url: `${SITE_URL}/authors/${u.slug}`,
      lastModified: new Date(u.lastModified),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));

    const founderRoutes: MetadataRoute.Sitemap = (founders as any[]).map((f) => ({
      url: `${SITE_URL}/authors/founder-${f.id}`,
      lastModified: new Date(f.lastModified),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));

    return [...userRoutes, ...founderRoutes];
  } catch (error) {
    console.error('Error generating authors sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [];
  }
}

import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { isBuildPhase } from '@/lib/build-fallback';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listingPage: MetadataRoute.Sitemap[0] = {
    url: `${SITE_URL}/opinions`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.9,
  };

  try {
    const [articles, topics] = await Promise.all([
      sql`
        SELECT slug, "updatedAt", "publishedAt"
        FROM "Article"
        WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL AND "noIndex" = false AND type = 'OPINION'
        ORDER BY "publishedAt" DESC
        LIMIT 5000
      `,
      sql`
        SELECT t.slug, MAX(a."updatedAt") as "lastModified", COUNT(*) as cnt
        FROM "Tag" t
        JOIN "Article" a ON a."primaryTagId" = t.id
        WHERE a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        GROUP BY t.slug
        HAVING COUNT(*) >= 3
      `,
    ]);

    const articleRoutes: MetadataRoute.Sitemap = (articles as any[]).map((a) => ({
      url: `${SITE_URL}/opinions/${a.slug}`,
      lastModified: new Date(a.updatedAt || a.publishedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    const topicRoutes: MetadataRoute.Sitemap = (topics as any[]).map((t) => ({
      url: `${SITE_URL}/opinions/topic/${t.slug}`,
      lastModified: new Date(t.lastModified),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    return [listingPage, ...articleRoutes, ...topicRoutes];
  } catch (error) {
    console.error('Error generating opinions sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [listingPage];
  }
}

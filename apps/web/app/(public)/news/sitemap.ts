import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { isBuildPhase } from '@/lib/build-fallback';
import { NEWS_SECTION_TYPES } from '@/lib/seo';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listingPage: MetadataRoute.Sitemap[0] = {
    url: `${SITE_URL}/news`,
    lastModified: new Date(),
    changeFrequency: 'hourly',
    priority: 0.9,
  };

  try {

    const news = await sql`
      SELECT slug, "updatedAt", "publishedAt"
      FROM "Article"
      WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL AND "noIndex" = false
        AND type::text = ANY(${NEWS_SECTION_TYPES}::text[])
      ORDER BY "publishedAt" DESC
      LIMIT 5000
    `;

    const newsRoutes: MetadataRoute.Sitemap = (news as any[]).map((n) => ({
      url: `${SITE_URL}/news/${n.slug}`,
      lastModified: new Date(n.updatedAt || n.publishedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    // Category pages that have something published.
    const categories = await sql`
      SELECT c.slug, MAX(a."updatedAt") AS "updatedAt"
      FROM "Category" c
      JOIN "Article" a ON a."categoryId" = c.id AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        AND a."noIndex" = false AND a.type <> 'STARTUP_UPDATE'
      GROUP BY c.slug
    `;
    const categoryRoutes: MetadataRoute.Sitemap = (categories as any[]).map((c) => ({
      url: `${SITE_URL}/news/category/${c.slug}`,
      lastModified: new Date(c.updatedAt),
      changeFrequency: 'daily' as const,
      priority: 0.6,
    }));

    return [listingPage, ...categoryRoutes, ...newsRoutes];
  } catch (error) {
    console.error('Error generating news sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [listingPage];
  }
}

import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { isBuildPhase } from '@/lib/build-fallback';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listingPage: MetadataRoute.Sitemap[0] = {
    url: `${SITE_URL}/stories`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  };

  try {

    const stories = await sql`
      SELECT slug, "updatedAt", "publishedAt"
      FROM "Article"
      WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL
        AND type = 'STORY'
      ORDER BY "publishedAt" DESC
      LIMIT 5000
    `;

    const storyRoutes: MetadataRoute.Sitemap = (stories as any[]).map((s) => ({
      url: `${SITE_URL}/stories/${s.slug}`,
      lastModified: new Date(s.updatedAt || s.publishedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    return [listingPage, ...storyRoutes];
  } catch (error) {
    console.error('Error generating stories sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [listingPage];
  }
}

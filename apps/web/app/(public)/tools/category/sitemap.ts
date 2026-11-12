import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { isBuildPhase } from '@/lib/build-fallback';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listingPage: MetadataRoute.Sitemap[0] = {
    url: `${SITE_URL}/tools`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  };

  try {

    const categories = await sql`
      SELECT slug, "createdAt"
      FROM "ToolCategory"
      WHERE "isActive" = true
      ORDER BY level ASC, "sortOrder" ASC
    `;

    const categoryRoutes: MetadataRoute.Sitemap = (categories as any[]).map((cat) => ({
      url: `${SITE_URL}/tools/category/${cat.slug}`,
      lastModified: new Date(cat.createdAt), // ToolCategory has no updatedAt column
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    return [listingPage, ...categoryRoutes];
  } catch (error) {
    console.error('Error generating category sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [listingPage];
  }
}

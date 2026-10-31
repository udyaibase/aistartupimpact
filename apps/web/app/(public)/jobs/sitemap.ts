import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listingPage: MetadataRoute.Sitemap[0] = {
    url: `${SITE_URL}/jobs`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  };

  try {
    const [jobs, companies] = await Promise.all([
      sql`
        SELECT slug, "updatedAt", "createdAt"
        FROM "JobBoardListing"
        WHERE status = 'OPEN' AND "moderationHold" = false AND "deletedAt" IS NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        ORDER BY "publishedAt" DESC
        LIMIT 1000
      `,
      sql`
        SELECT e.slug, MAX(l."updatedAt") as "lastModified"
        FROM "JobBoardEmployer" e
        JOIN "JobBoardListing" l ON l."employerId" = e.id
        WHERE e."isActive" = true AND l.status = 'OPEN' AND l."moderationHold" = false AND l."deletedAt" IS NULL
          AND (l."expiresAt" IS NULL OR l."expiresAt" > NOW())
        GROUP BY e.slug
      `,
    ]);

    const jobRoutes: MetadataRoute.Sitemap = (jobs as any[]).map((j) => ({
      url: `${SITE_URL}/jobs/${j.slug}`,
      lastModified: new Date(j.updatedAt || j.createdAt),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));

    const companyRoutes: MetadataRoute.Sitemap = (companies as any[]).map((c) => ({
      url: `${SITE_URL}/jobs/company/${c.slug}`,
      lastModified: new Date(c.lastModified),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    return [listingPage, ...jobRoutes, ...companyRoutes];
  } catch (error) {
    console.error('Error generating jobs sitemap:', error);
    return [listingPage];
  }
}

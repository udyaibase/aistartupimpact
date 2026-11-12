import { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { INDIA_CITY_KEYS, MIN_CITY_STARTUPS } from '@/lib/india-hq';
import { isBuildPhase } from '@/lib/build-fallback';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listingPage: MetadataRoute.Sitemap[0] = {
    url: `${SITE_URL}/india-ai`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  };

  try {

    // Only Indian cities with enough startups to be a useful page (same rule as the city page's noindex).
    // Listing all 830 cities sent Google hundreds of "0 companies" pages and foreign cities like Oslo.
    const [allCities, hqCounts] = await Promise.all([
      sql`SELECT slug, "cityName", aliases, "updatedAt" FROM "IndiaAICity" WHERE "isActive" = true ORDER BY "displayOrder" ASC`,
      sql`
        SELECT LOWER(TRIM("headquartersCity")) AS city, COUNT(*)::int AS n
        FROM "Startup"
        WHERE "isApproved" = true AND "deletedAt" IS NULL AND COALESCE("headquartersCity", '') <> ''
        GROUP BY 1
      `,
    ]);
    const countByCity = new Map((hqCounts as { city: string; n: number }[]).map((r) => [r.city, r.n]));
    const india = new Set(INDIA_CITY_KEYS);
    const cities = (allCities as { slug: string; cityName: string; aliases: string[] | null; updatedAt: string | null }[]).filter((c) => {
      const name = String(c.cityName).trim().toLowerCase();
      if (!india.has(name)) return false;
      const names = new Set([name, ...(c.aliases ?? []).map((a) => String(a).trim().toLowerCase())]);
      let n = 0;
      names.forEach((key) => { n += countByCity.get(key) ?? 0; });
      return n >= MIN_CITY_STARTUPS;
    });

    const cityRoutes: MetadataRoute.Sitemap = (cities as any[]).map((c) => ({
      url: `${SITE_URL}/india-ai/cities/${c.slug}`,
      lastModified: new Date(c.updatedAt || new Date()),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    const schemePages: MetadataRoute.Sitemap = [
      { url: `${SITE_URL}/india-ai/top-cities`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.7 },
      { url: `${SITE_URL}/india-ai/schemes`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.6 },
      { url: `${SITE_URL}/india-ai/schemes/indiaai-mission`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.6 },
      { url: `${SITE_URL}/india-ai/schemes/meity-grants`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.6 },
      { url: `${SITE_URL}/india-ai/schemes/startup-india-seed-fund`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.6 },
    ];

    return [listingPage, ...schemePages, ...cityRoutes];
  } catch (error) {
    console.error('Error generating india-ai sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [listingPage];
  }
}

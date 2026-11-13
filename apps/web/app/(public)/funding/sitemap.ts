import { MetadataRoute } from 'next';
import { isBuildPhase } from '@/lib/build-fallback';
import { getFundingRounds } from '@/lib/funding/rounds';
import { byCity, byInvestor, HUB_MIN_ROUNDS, inScope, monthsWithRounds, newestFirst, roundsInMonth } from '@/lib/funding/insights';
import { roundDate } from '@/lib/funding/format';

export const revalidate = 3600;

const SITE_URL = 'https://udyaibase.com';

/**
 * The funding tracker, every round's own page, and the India hub pages above their thin-content thresholds:
 * monthly reports, city hubs and investor pages. Same round list as the pages, so the two always agree.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tracker: MetadataRoute.Sitemap[0] = { url: `${SITE_URL}/funding`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 };
  try {
    const all = await getFundingRounds();
    const india = inScope(all, 'india');
    // A round with an unreadable date (bad data) must not break the whole sitemap: fall back to now / omit.
    const newest = (iso: string | undefined) => roundDate(iso) ?? new Date();

    const rounds = all.filter((r) => r.slug).map((r) => ({
      url: `${SITE_URL}/funding/${r.slug}`, lastModified: roundDate(r.announcedAt) ?? undefined, changeFrequency: 'monthly' as const, priority: 0.5,
    }));
    const months = monthsWithRounds(india, HUB_MIN_ROUNDS.month).map((m) => ({
      url: `${SITE_URL}/funding/india/${m.slug}`,
      lastModified: newest(newestFirst(roundsInMonth(india, m.year, m.month))[0]?.announcedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
    const cities = byCity(india).filter((c) => c.deals >= HUB_MIN_ROUNDS.city).map((c) => ({
      url: `${SITE_URL}/funding/india/${c.slug}`, lastModified: newest(newestFirst(india.filter((r) => r.city === c.name))[0]?.announcedAt), changeFrequency: 'weekly' as const, priority: 0.7,
    }));
    const investors = byInvestor(india).filter((i) => i.deals >= HUB_MIN_ROUNDS.investor).map((i) => ({
      url: `${SITE_URL}/funding/investors/${i.slug}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.6,
    }));
    return [{ ...tracker, lastModified: newest(newestFirst(india)[0]?.announcedAt) }, ...months, ...cities, ...investors, ...rounds];
  } catch (error) {
    console.error('Error generating funding sitemap:', error);
    // At runtime keep serving the last good sitemap; only the build falls back.
    if (!isBuildPhase()) throw error;
    return [tracker];
  }
}

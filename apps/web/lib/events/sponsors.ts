import { prisma } from '@udyaibase/database';
import { effectiveHostPlan, isPlatformOrganizer } from '@/lib/events/plans';
import { isOwnMediaUrl } from './certificate-pdf';
import { cleanHttpsUrl } from './recap';

/**
 * Event sponsors (Pro): tiers with logos on the event page and recap, optionally linked to a startup in the
 * Udyaibase directory. Impressions and clicks are counted so the host can send each sponsor a report.
 */

import { MAX_SPONSORS, SPONSOR_TIERS, tierLabel } from './sponsor-tiers';
export { MAX_SPONSORS, SPONSOR_TIERS, tierLabel, tierRank } from './sponsor-tiers';

export async function sponsorsAllowed(organizerId: string): Promise<boolean> {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
  return !!o && (isPlatformOrganizer(o.email) || effectiveHostPlan(o).key === 'PRO');
}

export type SponsorInput = { id?: string; name: string; tier: string; logoUrl: string | null; websiteUrl: string | null; startupId: string | null };

export function cleanSponsors(raw: unknown): SponsorInput[] | { error: string } {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_SPONSORS) : [];
  const out: SponsorInput[] = [];
  for (const item of list) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const name = String(r.name ?? '').trim().slice(0, 100);
    if (!name) return { error: 'Every sponsor needs a name.' };
    out.push({
      id: typeof r.id === 'string' ? r.id : undefined,
      name,
      tier: SPONSOR_TIERS.some((t) => t.value === r.tier) ? (r.tier as string) : 'PARTNER',
      logoUrl: isOwnMediaUrl(r.logoUrl as string) ? (r.logoUrl as string) : null,
      websiteUrl: cleanHttpsUrl(r.websiteUrl),
      startupId: typeof r.startupId === 'string' && r.startupId.length < 60 ? r.startupId : null,
    });
  }
  return out;
}

/** Where a sponsor click goes: their website, else their startup page on Udyaibase. */
export function sponsorTarget(s: { websiteUrl: string | null; startupSlug?: string | null }): string | null {
  if (s.websiteUrl) return s.websiteUrl;
  return s.startupSlug ? `/startups/${s.startupSlug}` : null;
}

/** CSV report for the host to send to sponsors. */
export function sponsorReportCsv(eventTitle: string, rows: { name: string; tier: string; impressions: number; clicks: number }[]): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Event', 'Sponsor', 'Tier', 'Page views with logo', 'Logo clicks', 'Click rate'].map(q).join(',')];
  for (const r of rows) {
    const rate = r.impressions ? `${((r.clicks / r.impressions) * 100).toFixed(1)}%` : '';
    lines.push([eventTitle, r.name, tierLabel(r.tier), r.impressions, r.clicks, rate].map(q).join(','));
  }
  return lines.join('\r\n');
}

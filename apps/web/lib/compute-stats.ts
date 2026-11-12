/**
 * India AI Ecosystem Stats Computation Engine
 * 
 * Computes real-time statistics from actual database records:
 * - Total AI Startups: counted from Startup table
 * - Total Funding: summed from FundingRound table  
 * - Monthly changes: computed from records created/announced this month
 * 
 * Manual stats (AI Engineers, Global Rank) are preserved as-is.
 */

import { sql } from '@/lib/db';
import { hqInIndia } from '@/lib/india-hq';

interface ComputedStat {
  metricKey: string;
  metricLabel: string;
  metricValue: string;
  metricChange: string;
  metricIcon: string;
  source: 'computed' | 'manual';
  displayOrder: number;
}

function formatNumber(num: number): string {
  if (num >= 10000000) {
    // Crores
    const crores = num / 10000000;
    if (crores >= 1000) {
      return `${(crores / 1000).toFixed(1)}K Cr`;
    }
    return `₹${crores.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
  }
  if (num >= 100000) {
    // Lakhs
    const lakhs = num / 100000;
    return `${lakhs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}L`;
  }
  if (num >= 1000) {
    return num.toLocaleString('en-IN');
  }
  return num.toString();
}

function formatFundingInr(amountPaise: number): string {
  // FundingRound.amountInr is stored in paise (1 INR = 100 paise)
  const inr = amountPaise / 100;
  const crores = inr / 10000000;
  
  if (crores >= 100000) {
    return `₹${(crores / 100000).toFixed(1)}L Cr`;
  }
  if (crores >= 1000) {
    return `₹${Math.round(crores).toLocaleString('en-IN')} Cr`;
  }
  if (crores >= 1) {
    return `₹${Math.round(crores).toLocaleString('en-IN')} Cr`;
  }
  const lakhs = inr / 100000;
  return `₹${Math.round(lakhs)}L`;
}

function formatCompactNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M+`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K+`;
  }
  return `${num}+`;
}

export async function computeEcosystemStats(): Promise<ComputedStat[]> {

  const [
    totalStartupsResult,
    thisMonthStartupsResult,
    totalFundingResult,
    thisMonthFundingResult,
    manualStats,
  ] = await Promise.all([
    // Total active Indian AI startups
    sql`
      SELECT COUNT(*)::int as count
      FROM "Startup"
      WHERE ${hqInIndia('"Startup"')}
        AND "deletedAt" IS NULL
        AND "isApproved" = true
    `,
    // Startups added this month
    sql`
      SELECT COUNT(*)::int as count
      FROM "Startup"
      WHERE ${hqInIndia('"Startup"')}
        AND "deletedAt" IS NULL
        AND "isApproved" = true
        AND "createdAt" >= date_trunc('month', NOW())
    `,
    // Total funding tracked (sum of all funding rounds for Indian startups)
    sql`
      SELECT COALESCE(SUM(fr."amountInr"), 0)::bigint as total
      FROM "FundingRound" fr
      JOIN "Startup" s ON fr."startupId" = s.id
      WHERE ${hqInIndia('s')}
        AND s."deletedAt" IS NULL
    `,
    // Funding announced this month
    sql`
      SELECT COALESCE(SUM(fr."amountInr"), 0)::bigint as total
      FROM "FundingRound" fr
      JOIN "Startup" s ON fr."startupId" = s.id
      WHERE ${hqInIndia('s')}
        AND s."deletedAt" IS NULL
        AND fr."announcedAt" >= date_trunc('month', NOW())
    `,
    // Fetch manual stats (AI Engineers, Global Rank) that we don't compute
    sql`
      SELECT "metricKey", "metricLabel", "metricValue", "metricChange", "metricIcon", "displayOrder"
      FROM "IndiaAIStats"
      WHERE "isActive" = true
        AND "metricKey" IN ('ai_engineers', 'global_rank')
      ORDER BY "displayOrder" ASC
    `,
  ]);

  const totalStartups = totalStartupsResult[0]?.count || 0;
  const thisMonthStartups = thisMonthStartupsResult[0]?.count || 0;
  const totalFunding = Number(totalFundingResult[0]?.total || 0);
  const thisMonthFunding = Number(thisMonthFundingResult[0]?.total || 0);

  // Build computed stats
  const computedStats: ComputedStat[] = [
    {
      metricKey: 'total_startups',
      metricLabel: 'Active AI Startups',
      metricValue: formatCompactNumber(totalStartups),
      metricChange: thisMonthStartups > 0 ? `+${thisMonthStartups} this month` : 'Updated live',
      metricIcon: 'rocket',
      source: 'computed',
      displayOrder: 1,
    },
    {
      metricKey: 'total_funding',
      metricLabel: 'Total Funding Tracked',
      metricValue: formatFundingInr(totalFunding),
      metricChange: thisMonthFunding > 0 
        ? `+${formatFundingInr(thisMonthFunding)} this month` 
        : 'Updated live',
      metricIcon: 'currency',
      source: 'computed',
      displayOrder: 2,
    },
  ];

  // Append manual stats (AI Engineers, Global Rank)
  const manualStatsFormatted: ComputedStat[] = (manualStats as any[]).map((s) => ({
    metricKey: s.metricKey,
    metricLabel: s.metricLabel,
    metricValue: s.metricValue,
    metricChange: s.metricChange || '',
    metricIcon: s.metricIcon || 'trophy',
    source: 'manual' as const,
    displayOrder: s.displayOrder || 99,
  }));

  return [...computedStats, ...manualStatsFormatted].sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Refreshes the IndiaAIStats table with computed values.
 * Call this from a cron endpoint or admin trigger.
 */
export async function refreshStatsInDatabase(): Promise<void> {
  const stats = await computeEcosystemStats();

  for (const stat of stats) {
    if (stat.source === 'computed') {
      await sql`
        UPDATE "IndiaAIStats"
        SET 
          "metricValue" = ${stat.metricValue},
          "metricChange" = ${stat.metricChange},
          "source" = 'computed',
          "lastUpdated" = NOW(),
          "updatedAt" = NOW()
        WHERE "metricKey" = ${stat.metricKey}
      `;
    }
  }
}

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { hqInIndia } from '@/lib/india-hq';

export const runtime = 'edge';
export const revalidate = 300; // Revalidate every 5 minutes

export async function GET() {
  try {

    // Compute real-time stats from actual data
    const [
      totalStartupsResult,
      thisMonthStartupsResult,
      totalFundingResult,
      thisMonthFundingResult,
      manualStats,
    ] = await Promise.all([
      sql`
        SELECT COUNT(*)::int as count
        FROM "Startup"
        WHERE ${hqInIndia('"Startup"')}
          AND "deletedAt" IS NULL
          AND "isApproved" = true
      `,
      sql`
        SELECT COUNT(*)::int as count
        FROM "Startup"
        WHERE ${hqInIndia('"Startup"')}
          AND "deletedAt" IS NULL
          AND "isApproved" = true
          AND "createdAt" >= date_trunc('month', NOW())
      `,
      sql`
        SELECT COALESCE(SUM("amountInr"), 0)::bigint as total
        FROM "FundingRound" fr
        JOIN "Startup" s ON fr."startupId" = s.id
        WHERE ${hqInIndia('s')}
          AND s."deletedAt" IS NULL
      `,
      sql`
        SELECT COALESCE(SUM("amountInr"), 0)::bigint as total
        FROM "FundingRound" fr
        JOIN "Startup" s ON fr."startupId" = s.id
        WHERE ${hqInIndia('s')}
          AND s."deletedAt" IS NULL
          AND fr."announcedAt" >= date_trunc('month', NOW())
      `,
      // Manual stats that can't be computed (external data)
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

    // Format funding — amountInr is stored in PAISE (1 INR = 100 paise)
    function formatFundingCr(amountPaise: number): string {
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

    // Build response
    const computedStats = [
      {
        metricKey: 'total_startups',
        metricLabel: 'Active AI Startups',
        metricValue: `${totalStartups.toLocaleString('en-IN')}+`,
        metricChange: thisMonthStartups > 0 ? `+${thisMonthStartups} this month` : 'Updated live',
        metricIcon: 'rocket',
        displayOrder: 1,
        source: 'computed',
        lastUpdated: new Date().toISOString(),
      },
      {
        metricKey: 'total_funding',
        metricLabel: 'Total Funding Tracked',
        metricValue: `${formatFundingCr(totalFunding)}+`,
        metricChange: thisMonthFunding > 0 
          ? `+${formatFundingCr(thisMonthFunding)} this month`
          : 'Updated live',
        metricIcon: 'currency',
        displayOrder: 2,
        source: 'computed',
        lastUpdated: new Date().toISOString(),
      },
    ];

    // Append manual stats
    const allStats = [
      ...computedStats,
      ...(manualStats as any[]).map(s => ({
        ...s,
        source: 'manual',
        lastUpdated: s.lastUpdated || null,
      })),
    ].sort((a: any, b: any) => (a.displayOrder || 99) - (b.displayOrder || 99));

    return NextResponse.json({
      success: true,
      data: allStats,
      lastUpdated: new Date().toISOString(),
      computed: true,
    });
  } catch (error) {
    console.error('Error computing India AI stats:', error);
    
    // Fallback: return static DB values if computation fails
    try {
      const stats = await sql`
        SELECT "metricKey", "metricLabel", "metricValue", "metricChange", "metricIcon", "displayOrder", "lastUpdated"
        FROM "IndiaAIStats"
        WHERE "isActive" = true
        ORDER BY "displayOrder" ASC
      `;
      return NextResponse.json({
        success: true,
        data: stats,
        lastUpdated: new Date().toISOString(),
        computed: false,
      });
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch stats' },
        { status: 500 }
      );
    }
  }
}

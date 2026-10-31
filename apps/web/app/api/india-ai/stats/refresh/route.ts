import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { trackCronRoute } from '@/lib/ops/cron';

export const dynamic = 'force-dynamic';

/**
 * POST /api/india-ai/stats/refresh
 * 
 * Recomputes ecosystem stats from real data and persists to IndiaAIStats table.
 * Can be triggered by:
 * - Admin button click
 * - Cron job (Vercel cron, external scheduler)
 * - After bulk data imports
 * 
 * Requires CRON_SECRET (Bearer). Vercel cron calls GET; POST is kept for manual triggers.
 */
export async function GET(req: NextRequest) {
  return trackCronRoute('india-ai-stats', () => refresh(req));
}

export async function POST(req: NextRequest) {
  return trackCronRoute('india-ai-stats', () => refresh(req));
}

async function refresh(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    // Compute real stats
    const [
      totalStartupsResult,
      thisMonthStartupsResult,
      totalFundingResult,
      thisMonthFundingResult,
    ] = await Promise.all([
      sql`
        SELECT COUNT(*)::int as count
        FROM "Startup"
        WHERE "isIndian" = true
          AND "deletedAt" IS NULL
          AND "isApproved" = true
      `,
      sql`
        SELECT COUNT(*)::int as count
        FROM "Startup"
        WHERE "isIndian" = true
          AND "deletedAt" IS NULL
          AND "isApproved" = true
          AND "createdAt" >= date_trunc('month', NOW())
      `,
      sql`
        SELECT COALESCE(SUM("amountInr"), 0)::bigint as total
        FROM "FundingRound" fr
        JOIN "Startup" s ON fr."startupId" = s.id
        WHERE s."isIndian" = true
          AND s."deletedAt" IS NULL
      `,
      sql`
        SELECT COALESCE(SUM("amountInr"), 0)::bigint as total
        FROM "FundingRound" fr
        JOIN "Startup" s ON fr."startupId" = s.id
        WHERE s."isIndian" = true
          AND s."deletedAt" IS NULL
          AND fr."announcedAt" >= date_trunc('month', NOW())
      `,
    ]);

    const totalStartups = totalStartupsResult[0]?.count || 0;
    const thisMonthStartups = thisMonthStartupsResult[0]?.count || 0;
    const totalFunding = Number(totalFundingResult[0]?.total || 0);
    const thisMonthFunding = Number(thisMonthFundingResult[0]?.total || 0);

    // Format
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

    // Update total_startups
    await sql`
      UPDATE "IndiaAIStats"
      SET 
        "metricValue" = ${`${totalStartups.toLocaleString('en-IN')}+`},
        "metricChange" = ${thisMonthStartups > 0 ? `+${thisMonthStartups} this month` : 'Updated live'},
        "source" = 'computed',
        "lastUpdated" = NOW(),
        "updatedAt" = NOW()
      WHERE "metricKey" = 'total_startups'
    `;

    // Update total_funding
    await sql`
      UPDATE "IndiaAIStats"
      SET 
        "metricValue" = ${`${formatFundingCr(totalFunding)}+`},
        "metricChange" = ${thisMonthFunding > 0 ? `+${formatFundingCr(thisMonthFunding)} this month` : 'Updated live'},
        "source" = 'computed',
        "lastUpdated" = NOW(),
        "updatedAt" = NOW()
      WHERE "metricKey" = 'total_funding'
    `;

    return NextResponse.json({
      success: true,
      message: 'Stats refreshed successfully',
      data: {
        totalStartups,
        thisMonthStartups,
        totalFunding: formatFundingCr(totalFunding),
        thisMonthFunding: formatFundingCr(thisMonthFunding),
      },
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error refreshing stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to refresh stats' },
      { status: 500 }
    );
  }
}

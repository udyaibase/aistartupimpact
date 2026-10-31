import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { withPublicRefresh } from '@/lib/refresh-public';

export const dynamic = 'force-dynamic';

async function postHandler() {
  const { error } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  if (error) return error;
  try {
    const sql = neon(process.env.DATABASE_URL!);

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

    // Persist computed stats
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
      message: 'Ecosystem stats refreshed from live data',
      data: {
        totalStartups: `${totalStartups.toLocaleString('en-IN')}+`,
        thisMonthStartups: `+${thisMonthStartups} this month`,
        totalFunding: `${formatFundingCr(totalFunding)}+`,
        thisMonthFunding: thisMonthFunding > 0 ? `+${formatFundingCr(thisMonthFunding)} this month` : 'No new funding this month',
      },
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error refreshing ecosystem stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to refresh stats' },
      { status: 500 }
    );
  }
}

export const POST = withPublicRefresh(['india-ai', 'home'], postHandler);

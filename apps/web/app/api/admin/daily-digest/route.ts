import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { dailyDigestHtml } from '@udyaibase/utils';
import { sendEmail } from '@/lib/email/send';
import { trackCronRoute } from '@/lib/ops/cron';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_DIGEST_EMAIL || 'admin@udyaibase.com';
const FROM_EMAIL = process.env.RESEND_NEWSLETTER_EMAIL || 'newsletter-noreply@udyaibase.com';

export async function GET(request: NextRequest) {
  return trackCronRoute('daily-digest', () => digest(request));
}

async function digest(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Calculate yesterday's date range
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const dayBeforeStart = new Date(yesterdayStart);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

    // Run all queries in parallel
    const [
      pageViews,
      pageViewsPrev,
      uniqueVisitors,
      topPages,
      newSubscribers,
      totalSubscribers,
      newWebUsers,
      totalWebUsers,
      newFounders,
      totalFounders,
      toolClicks,
      topToolClicks,
      clickSources,
      articlesPublished,
      articleViews,
    ] = await Promise.all([
      // Page views yesterday
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "PageView"
        WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" <= ${yesterdayEnd}
      `,
      // Page views day before (for comparison)
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "PageView"
        WHERE "createdAt" >= ${dayBeforeStart} AND "createdAt" < ${yesterdayStart}
      `,
      // Unique visitors yesterday
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "sessionHash") as count FROM "PageView"
        WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" <= ${yesterdayEnd}
      `,
      // Top pages yesterday
      prisma.$queryRaw<Array<{ pathname: string; count: bigint }>>`
        SELECT pathname, COUNT(*) as count FROM "PageView"
        WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" <= ${yesterdayEnd}
        GROUP BY pathname ORDER BY count DESC LIMIT 5
      `,
      // New newsletter subscribers yesterday
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "NewsletterSubscriber"
        WHERE "subscribedAt" >= ${yesterdayStart} AND "subscribedAt" <= ${yesterdayEnd}
      `,
      // Total subscribers
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "NewsletterSubscriber" WHERE "isActive" = true
      `,
      // New web users yesterday
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "User"
        WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" <= ${yesterdayEnd}
      `,
      // Total web users
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "User"
      `,
      // New founder signups yesterday
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "FounderUser"
        WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" <= ${yesterdayEnd}
      `,
      // Total founders
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "FounderUser"
      `,
      // Tool clicks yesterday
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "AffiliateClick"
        WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" <= ${yesterdayEnd}
      `,
      // Top tool clicks
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>`
        SELECT t.name, COUNT(*) as count
        FROM "AffiliateClick" ac
        JOIN "AiTool" t ON t.id = ac."toolId"
        WHERE ac."createdAt" >= ${yesterdayStart} AND ac."createdAt" <= ${yesterdayEnd}
        GROUP BY t.name ORDER BY count DESC LIMIT 3
      `,
      // Click sources
      prisma.$queryRaw<Array<{ sourcePage: string; count: bigint }>>`
        SELECT "sourcePage", COUNT(*) as count
        FROM "AffiliateClick"
        WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" <= ${yesterdayEnd}
        GROUP BY "sourcePage" ORDER BY count DESC
      `,
      // Articles published yesterday
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Article"
        WHERE "publishedAt" >= ${yesterdayStart} AND "publishedAt" <= ${yesterdayEnd}
        AND status = 'PUBLISHED'
      `,
      // Article views yesterday
      prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM("viewCount"), 0) as total FROM "Article"
        WHERE "publishedAt" >= ${yesterdayStart} AND "publishedAt" <= ${yesterdayEnd}
        AND status = 'PUBLISHED'
      `,
    ]);

    // Extract values
    const pvCount = Number(pageViews[0]?.count || 0);
    const pvPrev = Number(pageViewsPrev[0]?.count || 0);
    const pvChange = pvPrev > 0 ? Math.round(((pvCount - pvPrev) / pvPrev) * 100) : 0;
    const uvCount = Number(uniqueVisitors[0]?.count || 0);
    const subNew = Number(newSubscribers[0]?.count || 0);
    const subTotal = Number(totalSubscribers[0]?.count || 0);
    const usersNew = Number(newWebUsers[0]?.count || 0);
    const usersTotal = Number(totalWebUsers[0]?.count || 0);
    const foundersNew = Number(newFounders[0]?.count || 0);
    const foundersTotal = Number(totalFounders[0]?.count || 0);
    const clicksTotal = Number(toolClicks[0]?.count || 0);
    const pubCount = Number(articlesPublished[0]?.count || 0);
    const viewsTotal = Number(articleViews[0]?.total || 0);

    // Format date
    const dateStr = yesterdayStart.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const html = dailyDigestHtml({
      date: dateStr,
      pageViews: pvCount,
      pageViewsChange: pvChange,
      uniqueVisitors: uvCount,
      topPages: topPages.map(p => ({ path: p.pathname, views: Number(p.count) })),
      newSubscribers: subNew,
      totalSubscribers: subTotal,
      newWebUsers: usersNew,
      totalWebUsers: usersTotal,
      newFounders: foundersNew,
      totalFounders: foundersTotal,
      toolClicks: clicksTotal,
      topTools: topToolClicks.map(t => ({ name: t.name, clicks: Number(t.count) })),
      clickSources: clickSources.map(s => ({ source: s.sourcePage, count: Number(s.count) })),
      articlesPublished: pubCount,
      articleViews: viewsTotal,
    });

    await sendEmail({
      to: ADMIN_EMAIL,
      from: `Udyaibase <${FROM_EMAIL}>`,
      subject: `Daily Digest — ${yesterdayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      html,
      type: 'daily_digest',
    });

    return NextResponse.json({ success: true, date: dateStr });
  } catch (error: any) {
    console.error('[daily-digest] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate digest' }, { status: 500 });
  }
}


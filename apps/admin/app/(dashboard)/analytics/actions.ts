"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { publicError } from '@/lib/public-error';
import { sectionRoles } from '@/lib/section-access';

const ALLOWED = sectionRoles('/analytics');

export async function getAnalyticsDataAction(period: string = '7 days') {
  const session: any = await getServerSession(authOptions);

  
  if (!session?.user || !ALLOWED.includes(session.user.role)) {
    return { success: false, error: 'Unauthorized' };
  }


  try {
    // Calculate date range based on period
    let daysBack = 7;
    switch (period) {
      case '30 days': daysBack = 30; break;
      case '90 days': daysBack = 90; break;
      case 'This year': daysBack = 365; break;
    }

    const [
      articleStats,
      topArticles,
      placementStats,
      subscriberStats,
      userStats,
      pageViewStats,
    ] = await Promise.all([
      // Article view counts and metrics
      prisma.$queryRawUnsafe(`
        SELECT 
          COALESCE(SUM("viewCount"), 0) as total_views,
          COUNT(*) as total_articles,
          AVG("readTimeMinutes") as avg_read_time
        FROM "Article" 
        WHERE "publishedAt" >= NOW() - ($1::int * INTERVAL '1 day')
          AND status = 'PUBLISHED' 
          AND "deletedAt" IS NULL
      `, daysBack),
      
      // Top performing articles
      prisma.$queryRawUnsafe(`
        SELECT 
          a.title, a.slug, a."viewCount", a.type,
          u.name as author_name,
          c.name as category_name
        FROM "Article" a
        LEFT JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "Category" c ON c.id = a."categoryId"
        WHERE a."publishedAt" >= NOW() - ($1::int * INTERVAL '1 day')
          AND a.status = 'PUBLISHED' 
          AND a."deletedAt" IS NULL
        ORDER BY a."viewCount" DESC
        LIMIT 10
      `, daysBack),
      
      // Placement performance
      prisma.$queryRaw<any[]>`
        SELECT 
          COALESCE(SUM(cr."impressionCount"), 0) as total_impressions,
          COALESCE(SUM(cr."clickCount"), 0) as total_clicks,
          COUNT(DISTINCT c.id) as active_campaigns
        FROM "AdCampaign" c
        JOIN "AdCreative" cr ON cr."campaignId" = c.id
        WHERE c.status = 'ACTIVE'
          AND c."startDate" <= NOW()
          AND c."endDate" >= NOW()
      `,
      
      // Newsletter subscriber growth
      prisma.$queryRawUnsafe(`
        SELECT 
          COUNT(*) as total_subscribers,
          COUNT(*) FILTER (WHERE "subscribedAt" >= NOW() - ($1::int * INTERVAL '1 day')) as new_subscribers
        FROM "NewsletterSubscriber"
        WHERE "isActive" = true
      `, daysBack),
      
      // User activity
      prisma.$queryRawUnsafe(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE "lastLoginAt" >= NOW() - ($1::int * INTERVAL '1 day')) as active_users
        FROM "User"
        WHERE "isActive" = true
      `, daysBack),

      // PageView analytics
      prisma.$queryRawUnsafe(`
        SELECT 
          COUNT(*) as total_pageviews,
          COUNT(DISTINCT "sessionHash") as unique_visitors,
          COUNT(DISTINCT "ipHash") as unique_ips,
          AVG(CASE WHEN duration IS NOT NULL THEN duration ELSE 0 END) as avg_duration,
          COUNT(*) FILTER (WHERE bounced = true) as bounced_sessions
        FROM "PageView"
        WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day')
      `, daysBack),
    ]);

    const stats = (articleStats as any[])[0] || {};
    const placements = (placementStats as any[])[0] || {};
    const subscribers = (subscriberStats as any[])[0] || {};
    const users = (userStats as any[])[0] || {};
    const pageViews = (pageViewStats as any[])[0] || {};

    // Calculate CTR
    const totalImpressions = Number(placements.total_impressions || 0);
    const totalClicks = Number(placements.total_clicks || 0);
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

    // Calculate real metrics from PageView data
    const totalPageviews = Number(pageViews.total_pageviews || 0);
    const uniqueVisitors = Number(pageViews.unique_visitors || 0);
    const avgDurationSeconds = Number(pageViews.avg_duration || 0);
    const bouncedSessions = Number(pageViews.bounced_sessions || 0);
    
    // Format average session duration
    const avgSession = avgDurationSeconds > 0 
      ? `${Math.floor(avgDurationSeconds / 60)}m ${avgDurationSeconds % 60}s`
      : 'N/A';
    
    // Calculate bounce rate
    const bounceRate = totalPageviews > 0 
      ? `${Math.round((bouncedSessions / totalPageviews) * 100)}%`
      : 'N/A';

    // Fetch real traffic data by source
    const trafficBySource = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        source,
        COUNT(*) as visits
      FROM "PageView"
      WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY source
      ORDER BY visits DESC
    `, daysBack);

    // Calculate traffic source percentages
    const referrers = trafficBySource.map((item: any) => {
      const visits = Number(item.visits || 0);
      const pct = totalPageviews > 0 ? Math.round((visits / totalPageviews) * 100) : 0;
      
      // Map source codes to friendly names
      const sourceNames: Record<string, string> = {
        'DIRECT': 'Direct',
        'SEARCH': 'Search Engines',
        'SOCIAL': 'Social Media',
        'REFERRAL': 'Referral',
        'EMAIL': 'Email/Newsletter',
      };
      
      return {
        source: sourceNames[item.source] || item.source,
        visits,
        pct,
      };
    });

    // If no traffic data, show placeholder
    const finalReferrers = referrers.length > 0 ? referrers : [
      { source: 'No traffic data yet', visits: 0, pct: 0 },
    ];

    // Fetch real device breakdown
    const deviceBreakdown = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        device,
        COUNT(*) as count
      FROM "PageView"
      WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY device
      ORDER BY count DESC
    `, daysBack);

    // Calculate device percentages
    const devices = deviceBreakdown.map((item: any) => {
      const count = Number(item.count || 0);
      const pct = totalPageviews > 0 ? Math.round((count / totalPageviews) * 100) : 0;
      
      // Capitalize device names
      const deviceName = item.device.charAt(0) + item.device.slice(1).toLowerCase();
      
      return {
        type: deviceName,
        pct,
      };
    });

    // If no device data, show placeholder
    const finalDevices = devices.length > 0 ? devices : [
      { type: 'Desktop', pct: 0 },
      { type: 'Mobile', pct: 0 },
      { type: 'Tablet', pct: 0 },
    ];

    return {
      success: true,
      data: {
        metrics: {
          pageviews: totalPageviews,
          uniqueVisitors,
          avgSession,
          bounceRate,
          totalArticles: Number(stats.total_articles || 0),
          avgReadTime: Number(stats.avg_read_time || 0).toFixed(1),
          totalImpressions,
          totalClicks,
          ctr: ctr + '%',
          activeCampaigns: Number(placements.active_campaigns || 0),
          totalSubscribers: Number(subscribers.total_subscribers || 0),
          newSubscribers: Number(subscribers.new_subscribers || 0),
          totalUsers: Number(users.total_users || 0),
          activeUsers: Number(users.active_users || 0),
        },
        topArticles: (topArticles as any[]).map((a: any) => ({
          title: a.title,
          slug: a.slug,
          views: Number(a.viewCount || 0),
          type: a.type,
          author: a.author_name,
          category: a.category_name,
        })),
        referrers: finalReferrers,
        devices: finalDevices,
      },
    };
  } catch (e: any) {
    console.error('Analytics query error:', e);
    return { success: false, error: publicError(e) };
  }
}
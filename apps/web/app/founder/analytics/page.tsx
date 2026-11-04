import { requireFounderAuth } from '@/lib/founder-auth';
import { workspaceOwnerIds } from '@/lib/founder/access';
import { sql } from '@/lib/db';
import Link from 'next/link';
import { BarChart3, Plus } from 'lucide-react';
import { EmptyGuide } from '@/components/founder/Guidance';
import { 
  TrendingUp, 
  Eye, 
  MousePointerClick, 
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
export default async function AnalyticsPage() {
  const session = await requireFounderAuth();
  const ownerIds = await workspaceOwnerIds(session);

  const [listings] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL)
      + (SELECT COUNT(*)::int FROM "AiTool" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL) AS count
  `;
  const hasListings = Number(listings?.count ?? 0) > 0;

  // Fetch analytics data
  const [currentMonth, lastMonth, allTime, topItems] = await Promise.all([
    // Current month stats
    sql`
      SELECT 
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(clicks), 0) AS clicks
      FROM "AnalyticsDaily"
      WHERE (
        ("entityType" = 'STARTUP' AND "entityId" IN (SELECT id FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
        OR ("entityType" = 'TOOL' AND "entityId" IN (SELECT id FROM "AiTool" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
      )
        AND date >= DATE_TRUNC('month', CURRENT_DATE)
    `,
    
    // Last month stats
    sql`
      SELECT 
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(clicks), 0) AS clicks
      FROM "AnalyticsDaily"
      WHERE (
        ("entityType" = 'STARTUP' AND "entityId" IN (SELECT id FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
        OR ("entityType" = 'TOOL' AND "entityId" IN (SELECT id FROM "AiTool" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
      )
        AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND date < DATE_TRUNC('month', CURRENT_DATE)
    `,
    
    // All time stats
    sql`
      SELECT 
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(clicks), 0) AS clicks
      FROM "AnalyticsDaily"
      WHERE (
        ("entityType" = 'STARTUP' AND "entityId" IN (SELECT id FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
        OR ("entityType" = 'TOOL' AND "entityId" IN (SELECT id FROM "AiTool" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
      )
    `,
    
    // Top performing items
    sql`
      SELECT 
        fa."entityType",
        fa."entityId",
        COALESCE(s.name, t.name) AS name,
        COALESCE(s.slug, t.slug) AS slug,
        SUM(fa.views) AS "totalViews",
        SUM(fa.clicks) AS "totalClicks"
      FROM "AnalyticsDaily" fa
      LEFT JOIN "Startup" s ON fa."entityId" = s.id AND fa."entityType" = 'STARTUP'
      LEFT JOIN "AiTool" t ON fa."entityId" = t.id AND fa."entityType" = 'TOOL'
      WHERE (s."ownerId" = ANY(${ownerIds}) AND s."deletedAt" IS NULL) OR (t."ownerId" = ANY(${ownerIds}) AND t."deletedAt" IS NULL)
      GROUP BY fa."entityType", fa."entityId", s.name, t.name, s.slug, t.slug
      ORDER BY SUM(fa.views) DESC
      LIMIT 5
    `,
  ]);

  const currentViews = Number(currentMonth[0]?.views || 0);
  const currentClicks = Number(currentMonth[0]?.clicks || 0);
  const lastViews = Number(lastMonth[0]?.views || 0);
  const lastClicks = Number(lastMonth[0]?.clicks || 0);
  const totalViews = Number(allTime[0]?.views || 0);
  const totalClicks = Number(allTime[0]?.clicks || 0);

  // Calculate changes
  const viewsChange = lastViews > 0 ? ((currentViews - lastViews) / lastViews * 100).toFixed(1) : '0';
  const clicksChange = lastClicks > 0 ? ((currentClicks - lastClicks) / lastClicks * 100).toFixed(1) : '0';
  const ctr = currentViews > 0 ? ((currentClicks / currentViews) * 100).toFixed(1) : '0.0';
  const lastCtr = lastViews > 0 ? ((lastClicks / lastViews) * 100).toFixed(1) : '0.0';
  const ctrChange = lastCtr !== '0.0' ? ((Number(ctr) - Number(lastCtr)) / Number(lastCtr) * 100).toFixed(1) : '0';

  const getTrendIcon = (change: string) => {
    const num = Number(change);
    if (num > 0) return <ArrowUp className="w-3 h-3" />;
    if (num < 0) return <ArrowDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getTrendColor = (change: string) => {
    const num = Number(change);
    if (num > 0) return 'text-gray-900 dark:text-white';
    if (num < 0) return 'text-gray-600 dark:text-gray-400';
    return 'text-gray-500 dark:text-gray-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="portal-title">
          Analytics
        </h1>
        <p className="portal-subtitle">
          Performance metrics for your listings
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Views */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Views</span>
            <Eye className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-white">
              {currentViews.toLocaleString()}
            </span>
            <span className={`flex items-center gap-0.5 text-xs font-medium ${getTrendColor(viewsChange)}`}>
              {getTrendIcon(viewsChange)}
              {Math.abs(Number(viewsChange))}%
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">This month</p>
        </div>

        {/* Clicks */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Clicks</span>
            <MousePointerClick className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-white">
              {currentClicks.toLocaleString()}
            </span>
            <span className={`flex items-center gap-0.5 text-xs font-medium ${getTrendColor(clicksChange)}`}>
              {getTrendIcon(clicksChange)}
              {Math.abs(Number(clicksChange))}%
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">This month</p>
        </div>

        {/* CTR */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">CTR</span>
            <TrendingUp className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-white">
              {ctr}%
            </span>
            <span className={`flex items-center gap-0.5 text-xs font-medium ${getTrendColor(ctrChange)}`}>
              {getTrendIcon(ctrChange)}
              {Math.abs(Number(ctrChange))}%
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">This month</p>
        </div>

        {/* All Time */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">All Time</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {totalViews.toLocaleString()}
              </span>
              <span className="text-xs text-gray-500">views</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {totalClicks.toLocaleString()}
              </span>
              <span className="text-xs text-gray-500">clicks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Performing Items */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="portal-section-title">
            Top Performing Listings
          </h2>
        </div>
        
        {topItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Views
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Clicks
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    CTR
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {topItems.map((item: any, index: number) => {
                  const itemViews = Number(item.totalViews || 0);
                  const itemClicks = Number(item.totalClicks || 0);
                  const itemCtr = itemViews > 0 ? ((itemClicks / itemViews) * 100).toFixed(1) : '0.0';
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                        {item.name || 'Unnamed'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          {item.entityType === 'STARTUP' ? 'Startup' : 'Tool'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white font-medium">
                        {itemViews.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white font-medium">
                        {itemClicks.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white font-medium">
                        {itemCtr}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          hasListings ? (
          <EmptyGuide
            bare
            icon={BarChart3}
            title="No views or clicks yet"
            action={<Link href="/founder/startups" className="btn-brand">View my listings</Link>}
          >
            Share your listing’s link on LinkedIn or with your network. Your best-performing listings will show here as people visit.
          </EmptyGuide>
        ) : (
          <EmptyGuide
            bare
            icon={BarChart3}
            title="Nothing to measure yet"
            action={<Link href="/founder/startups/new" className="btn-brand gap-2"><Plus className="w-4 h-4" aria-hidden /> List your startup</Link>}
          >
            Analytics show how people find and use your listings, so you’ll need one first.
          </EmptyGuide>
        )
        )}
      </div>
    </div>
  );
}

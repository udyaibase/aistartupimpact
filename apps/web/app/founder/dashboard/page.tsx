import { requireFounderAuth } from '@/lib/founder-auth';
import { sql } from '@/lib/db';
import { Rocket, Wrench, Eye, MousePointerClick, Plus, TrendingUp, Share2, Globe, Search, AtSign, Link2, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import StatCard from '@/components/founder/StatCard';
import ListingCard from '@/components/founder/ListingCard';

export const revalidate = 10;

export default async function DashboardPage() {
  const session = await requireFounderAuth();

  const [startups, tools, currentMonth, lastMonth] = await Promise.all([
    sql`
      SELECT id, name, slug, tagline, "logoUrl", "claimStatus", "isVerified", "createdAt"
      FROM "Startup"
      WHERE "ownerId" = ${session.userId}
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 5
    `,
    sql`
      SELECT id, name, slug, tagline, "logoUrl", status AS "claimStatus", "createdAt"
      FROM "AiTool"
      WHERE "ownerId" = ${session.userId}
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 5
    `,
    sql`
      SELECT
        COALESCE(SUM(views), 0) AS "totalViews",
        COALESCE(SUM(clicks), 0) AS "totalClicks",
        COALESCE(SUM(shares), 0) AS "totalShares",
        COALESCE(SUM("directViews"), 0) AS "directViews",
        COALESCE(SUM("searchViews"), 0) AS "searchViews",
        COALESCE(SUM("socialViews"), 0) AS "socialViews",
        COALESCE(SUM("referralViews"), 0) AS "referralViews"
      FROM "FounderAnalytics"
      WHERE "userId" = ${session.userId}
        AND date >= DATE_TRUNC('month', CURRENT_DATE)
    `,
    sql`
      SELECT
        COALESCE(SUM(views), 0) AS "totalViews",
        COALESCE(SUM(clicks), 0) AS "totalClicks"
      FROM "FounderAnalytics"
      WHERE "userId" = ${session.userId}
        AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND date < DATE_TRUNC('month', CURRENT_DATE)
    `,
  ]);

  const currentViews = Number(currentMonth[0]?.totalViews || 0);
  const currentClicks = Number(currentMonth[0]?.totalClicks || 0);
  const currentShares = Number(currentMonth[0]?.totalShares || 0);
  const lastViews = Number(lastMonth[0]?.totalViews || 0);
  const lastClicks = Number(lastMonth[0]?.totalClicks || 0);

  const ctr = currentViews > 0 ? ((currentClicks / currentViews) * 100).toFixed(1) : '0.0';
  const lastCtr = lastViews > 0 ? ((lastClicks / lastViews) * 100).toFixed(1) : '0.0';

  const viewsTrend = lastViews > 0 ? (((currentViews - lastViews) / lastViews) * 100).toFixed(0) : '0';
  const ctrTrend = lastCtr !== '0.0' ? (((Number(ctr) - Number(lastCtr)) / Number(lastCtr)) * 100).toFixed(0) : '0';

  const viewsTrendText = Number(viewsTrend) > 0 ? `+${viewsTrend}%` : Number(viewsTrend) < 0 ? `${viewsTrend}%` : undefined;
  const ctrTrendText = Number(ctrTrend) > 0 ? `+${ctrTrend}%` : Number(ctrTrend) < 0 ? `${ctrTrend}%` : undefined;

  const trafficSources = {
    direct: Number(currentMonth[0]?.directViews || 0),
    search: Number(currentMonth[0]?.searchViews || 0),
    social: Number(currentMonth[0]?.socialViews || 0),
    referral: Number(currentMonth[0]?.referralViews || 0),
  };
  const totalSourceViews = trafficSources.direct + trafficSources.search + trafficSources.social + trafficSources.referral;

  let perListingAnalytics: any[] = [];
  try {
    const allIds = [
      ...startups.map((s: any) => s.id),
      ...tools.map((t: any) => t.id),
    ];
    if (allIds.length > 0) {
      perListingAnalytics = await sql`
        SELECT
          "entityId",
          "entityType",
          COALESCE(SUM(views), 0)::int AS views,
          COALESCE(SUM(shares), 0)::int AS shares,
          COALESCE(SUM("socialViews"), 0)::int AS "socialViews",
          COALESCE(SUM("searchViews"), 0)::int AS "searchViews",
          COALESCE(SUM("directViews"), 0)::int AS "directViews"
        FROM "AnalyticsDaily"
        WHERE "entityId" = ANY(${allIds})
        GROUP BY "entityId", "entityType"
      `.catch(() => []);
    }
  } catch {}

  const analyticsMap = new Map(perListingAnalytics.map((a: any) => [a.entityId, a]));

  const sourceBreakdown = [
    { label: 'Direct', value: trafficSources.direct, icon: Globe, color: 'bg-blue-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.direct / totalSourceViews) * 100) : 0 },
    { label: 'Search (Google)', value: trafficSources.search, icon: Search, color: 'bg-green-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.search / totalSourceViews) * 100) : 0 },
    { label: 'Social Media', value: trafficSources.social, icon: Share2, color: 'bg-purple-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.social / totalSourceViews) * 100) : 0 },
    { label: 'Referral', value: trafficSources.referral, icon: Link2, color: 'bg-cyan-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.referral / totalSourceViews) * 100) : 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand" />
          Dashboard
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Overview of your listings, traffic sources & performance
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Startups" value={startups.length} icon={Rocket} href="/founder/startups" />
        <StatCard title="Tools" value={tools.length} icon={Wrench} href="/founder/tools" />
        <StatCard title="Views" value={currentViews.toLocaleString()} icon={Eye} trend={viewsTrendText} />
        <StatCard title="Clicks" value={currentClicks.toLocaleString()} icon={MousePointerClick} />
        <StatCard title="Shares" value={currentShares.toLocaleString()} icon={Share2} />
        <StatCard title="CTR" value={`${ctr}%`} icon={TrendingUp} trend={ctrTrendText} />
      </div>

      {/* Traffic Sources */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Traffic Sources (This Month)</h2>
        {totalSourceViews === 0 ? (
          <p className="text-xs text-gray-400">No UTM data yet. Share your listings to start tracking traffic sources.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {sourceBreakdown.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <s.icon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{s.label}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{s.value} <span className="text-gray-400 font-normal">({s.pct}%)</span></span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-Listing Performance */}
      {(startups.length > 0 || tools.length > 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Listing Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 px-2 font-medium text-center">Type</th>
                  <th className="pb-2 px-2 font-medium text-center">Views</th>
                  <th className="pb-2 px-2 font-medium text-center">Shares</th>
                  <th className="pb-2 px-2 font-medium text-center">Social</th>
                  <th className="pb-2 pl-2 font-medium text-center">Search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {[...startups.map((s: any) => ({ ...s, type: 'Startup' })), ...tools.map((t: any) => ({ ...t, type: 'Tool' }))].map((item: any) => {
                  const a = analyticsMap.get(item.id) || { views: 0, shares: 0, socialViews: 0, searchViews: 0 };
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300 truncate max-w-[200px] font-medium">{item.name}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${item.type === 'Startup' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'}`}>{item.type}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center text-gray-900 dark:text-white font-semibold">{a.views}</td>
                      <td className="py-2.5 px-2 text-center text-pink-500">{a.shares}</td>
                      <td className="py-2.5 px-2 text-center text-purple-500">{a.socialViews}</td>
                      <td className="py-2.5 pl-2 text-center text-green-500">{a.searchViews}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Listings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Startups</h2>
            <Link href="/founder/startups" className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">View all</Link>
          </div>
          {startups.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 text-center">
              <Rocket className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No startups yet</p>
              <Link href="/founder/startups/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Submit Startup
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {startups.map((startup: any) => (
                <ListingCard key={startup.id} id={startup.id} slug={startup.slug} name={startup.name} tagline={startup.tagline} logoUrl={startup.logoUrl} status={startup.claimStatus} type="startup" isVerified={startup.isVerified} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Tools</h2>
            <Link href="/founder/tools" className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">View all</Link>
          </div>
          {tools.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 text-center">
              <Wrench className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No tools yet</p>
              <Link href="/founder/tools/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Submit Tool
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {tools.map((tool: any) => (
                <ListingCard key={tool.id} id={tool.id} slug={tool.slug} name={tool.name} tagline={tool.tagline} logoUrl={tool.logoUrl} status={tool.claimStatus} type="tool" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cross-sell */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a href="/employer/login" className="card p-4 flex items-center gap-3 hover:border-brand/30 transition-colors group">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-navy dark:text-white font-jakarta group-hover:text-brand transition-colors">Hiring? Post a job</p>
            <p className="text-xs text-gray-400 font-jakarta">Reach 45K+ AI professionals</p>
          </div>
        </a>
        <a href="/organizer/login" className="card p-4 flex items-center gap-3 hover:border-brand/30 transition-colors group">
          <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-navy dark:text-white font-jakarta group-hover:text-brand transition-colors">Hosting an event? Create one</p>
            <p className="text-xs text-gray-400 font-jakarta">List your AI event for free</p>
          </div>
        </a>
      </div>
    </div>
  );
}

import { requireFounderAuth } from '@/lib/founder-auth';
import { workspaceOwnerIds } from '@/lib/founder/access';
import { sql } from '@/lib/db';
import { Rocket, Wrench, Eye, MousePointerClick, Plus, TrendingUp, Share2, Globe, Search, Link2, ArrowRight, Check, Briefcase, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import StatCard from '@/components/founder/StatCard';
import ListingCard from '@/components/founder/ListingCard';

export const revalidate = 10;

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const CARD = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';

export default async function DashboardPage() {
  const session = await requireFounderAuth();
  const ownerIds = await workspaceOwnerIds(session);

  const [startups, tools, currentMonth, lastMonth, counts, profile] = await Promise.all([
    sql`
      SELECT id, name, slug, tagline, "logoUrl", "claimStatus", "isVerified", "createdAt"
      FROM "Startup"
      WHERE "ownerId" = ANY(${ownerIds})
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 5
    `,
    sql`
      SELECT id, name, slug, tagline, "logoUrl", status AS "claimStatus", "createdAt"
      FROM "AiTool"
      WHERE "ownerId" = ANY(${ownerIds})
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
        COALESCE(SUM("referralViews"), 0) + COALESCE(SUM("emailViews"), 0) AS "referralViews"
      FROM "AnalyticsDaily"
      WHERE (
        ("entityType" = 'STARTUP' AND "entityId" IN (SELECT id FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
        OR ("entityType" = 'TOOL' AND "entityId" IN (SELECT id FROM "AiTool" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
      )
        AND date >= DATE_TRUNC('month', CURRENT_DATE)
    `,
    sql`
      SELECT
        COALESCE(SUM(views), 0) AS "totalViews",
        COALESCE(SUM(clicks), 0) AS "totalClicks"
      FROM "AnalyticsDaily"
      WHERE (
        ("entityType" = 'STARTUP' AND "entityId" IN (SELECT id FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
        OR ("entityType" = 'TOOL' AND "entityId" IN (SELECT id FROM "AiTool" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL))
      )
        AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND date < DATE_TRUNC('month', CURRENT_DATE)
    `,
    // The lists above show the newest 5; these are the real totals.
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL) AS startups,
        (SELECT COUNT(*)::int FROM "Startup" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL AND "isVerified" = true) AS verified,
        (SELECT COUNT(*)::int FROM "AiTool" WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL) AS tools
    `,
    sql`SELECT name, avatar, bio FROM "FounderUser" WHERE id = ${session.userId} LIMIT 1`,
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

  const totals = counts[0] ?? { startups: 0, verified: 0, tools: 0 };
  const me = profile[0];
  const hello = String(me?.name ?? '').split(' ')[0] || 'there';
  const setup = [
    { key: 'startup', label: 'List your startup', hint: 'Add it to the directory so people can find you.', href: '/founder/startups/new', done: totals.startups > 0 },
    { key: 'verify', label: 'Verify your startup', hint: 'Prove you own the domain to get the Verified badge and post jobs.', href: '/founder/startups', done: totals.verified > 0 },
    { key: 'tool', label: 'List an AI tool', hint: 'Built an AI product? Add it to the tools directory so people can discover it.', href: '/founder/tools/new', done: totals.tools > 0 },
    { key: 'profile', label: 'Complete your profile', hint: 'Add a photo and short bio so people know who’s behind it.', href: '/founder/profile', done: !!(me?.avatar && me?.bio) },
  ];
  const doneCount = setup.filter((step) => step.done).length;
  const listings = [...startups.map((x: any) => ({ ...x, type: 'Startup' })), ...tools.map((x: any) => ({ ...x, type: 'Tool' }))];

  return (
    <div className="font-jakarta">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="portal-title">{greeting()}, {hello}</h1>
          <p className="portal-subtitle">
            {listings.length > 0
              ? `${totals.startups} startup${totals.startups === 1 ? '' : 's'} and ${totals.tools} tool${totals.tools === 1 ? '' : 's'} listed. ${currentViews.toLocaleString('en-IN')} view${currentViews === 1 ? '' : 's'} this month.`
              : 'List your startup to get discovered by investors, customers and talent.'}
          </p>
        </div>
        {totals.startups === 0 ? (
          <Link href="/founder/startups/new" className="btn-brand gap-2 shrink-0">
            <Plus className="w-4 h-4" aria-hidden /> Submit your startup
          </Link>
        ) : (
          <Link href="/founder/content" className="btn-brand gap-2 shrink-0">
            <Plus className="w-4 h-4" aria-hidden /> Create
          </Link>
        )}
      </div>

      {/* Setup checklist */}
      {doneCount < setup.length && (
        <section aria-labelledby="setup-title" className={`${CARD} p-4 sm:p-5 mb-6`}>
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 id="setup-title" className="portal-section-title">Finish setting up</h2>
            <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">{doneCount} of {setup.length} done</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-4" role="progressbar" aria-valuemin={0} aria-valuemax={setup.length} aria-valuenow={doneCount} aria-label="Setup progress">
            <div className="h-full bg-brand rounded-full" style={{ width: `${(doneCount / setup.length) * 100}%` }} />
          </div>
          <ol className="grid gap-1">
            {setup.map((step) => (
              <li key={step.key}>
                {step.done ? (
                  <div className="flex items-center gap-3 px-2 py-2.5 rounded-[10px]">
                    <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0" aria-hidden><Check className="w-3.5 h-3.5" /></span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 line-through decoration-gray-300">{step.label}</span>
                    <span className="sr-only">Done</span>
                  </div>
                ) : (
                  <Link href={step.href} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-gray-50 dark:hover:bg-gray-800/60 group">
                    <span className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" aria-hidden />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{step.label}</span>
                      <span className="block text-[13px] text-gray-600 dark:text-gray-400">{step.hint}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-brand shrink-0" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Stats */}
      <section aria-label="Your listings at a glance" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <StatCard title="Startup" value={totals.startups} icon={Rocket} href="/founder/startups" sub={`${totals.verified} verified`} />
        <StatCard title="AI tool" value={totals.tools} icon={Wrench} href="/founder/tools" sub="Listed" />
        <StatCard title="Views" value={currentViews.toLocaleString('en-IN')} icon={Eye} sub={viewsTrendText ? `${viewsTrendText} vs last month` : 'This month'} />
        <StatCard title="Clicks" value={currentClicks.toLocaleString('en-IN')} icon={MousePointerClick} sub="This month" />
        <StatCard title="Shares" value={currentShares.toLocaleString('en-IN')} icon={Share2} sub="This month" />
        <StatCard title="Click rate" value={`${ctr}%`} icon={TrendingUp} sub={ctrTrendText ? `${ctrTrendText} vs last month` : 'This month'} />
      </section>

      {/* Traffic sources */}
      <section aria-labelledby="traffic-title" className={`${CARD} p-4 sm:p-5 mb-6`}>
        <h2 id="traffic-title" className="portal-section-title mb-4">Traffic sources <span className="font-jakarta font-normal text-sm text-gray-500 dark:text-gray-400">this month</span></h2>
        {totalSourceViews === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">No visits yet this month. Share your listing’s link on LinkedIn or with your network, and you’ll see where your visitors come from here.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {sourceBreakdown.map((source) => (
              <div key={source.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <source.icon className="w-4 h-4 text-gray-400" aria-hidden />
                    <span className="text-[13px] text-gray-700 dark:text-gray-300">{source.label}</span>
                  </div>
                  <span className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">{source.value} <span className="text-gray-500 font-normal">({source.pct}%)</span></span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${source.color} rounded-full transition-all`} style={{ width: `${source.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Listing performance */}
      {listings.length > 0 && (
        <section aria-labelledby="performance-title" className={`${CARD} mb-6`}>
          <div className="px-4 sm:px-5 pt-4 pb-3">
            <h2 id="performance-title" className="portal-section-title">Listing performance</h2>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-gray-100 dark:border-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <th scope="col" className="px-5 py-2.5 font-semibold">Name</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Type</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold text-right">Views</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold text-right">Shares</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold text-right">Social</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold text-right">Search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {listings.map((item: any) => {
                  const a = analyticsMap.get(item.id) || { views: 0, shares: 0, socialViews: 0, searchViews: 0 };
                  return (
                    <tr key={item.id}>
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white truncate max-w-[260px]">{item.name}</td>
                      <td className="px-3 py-3"><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{item.type}</span></td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{a.views}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{a.shares}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{a.socialViews}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{a.searchViews}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
            {listings.map((item: any) => {
              const a = analyticsMap.get(item.id) || { views: 0, shares: 0, socialViews: 0, searchViews: 0 };
              return (
                <li key={item.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">{item.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0">{item.type}</span>
                  </div>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 tabular-nums">{a.views} views · {a.shares} shares · {a.socialViews} social · {a.searchViews} search</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Recent listings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
        <section aria-labelledby="startups-title">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 id="startups-title" className="portal-section-title">Your startup</h2>
            {startups.length > 0 && <Link href="/founder/startups" className="text-sm font-semibold text-brand hover:underline">All startups</Link>}
          </div>
          {startups.length === 0 ? (
            <div className={`${CARD} px-4 py-8 text-center`}>
              <span className="w-12 h-12 rounded-[12px] bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center mx-auto mb-3" aria-hidden><Rocket className="w-6 h-6" /></span>
              <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No startup yet</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">List your startup so people can find it. We’ll review it and email you once it’s live.</p>
              <Link href="/founder/startups/new" className="btn-brand gap-2 mt-4"><Plus className="w-4 h-4" aria-hidden /> Submit your startup</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {startups.map((startup: any) => (
                <ListingCard key={startup.id} id={startup.id} slug={startup.slug} name={startup.name} tagline={startup.tagline} logoUrl={startup.logoUrl} status={startup.claimStatus} type="startup" isVerified={startup.isVerified} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="tools-title">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 id="tools-title" className="portal-section-title">Your AI tool</h2>
            {tools.length > 0 && <Link href="/founder/tools" className="text-sm font-semibold text-brand hover:underline">All tools</Link>}
          </div>
          {tools.length === 0 ? (
            <div className={`${CARD} px-4 py-8 text-center`}>
              <span className="w-12 h-12 rounded-[12px] bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center mx-auto mb-3" aria-hidden><Wrench className="w-6 h-6" /></span>
              <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No AI tool yet</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">Built an AI product? List it so people can discover it in the tools directory.</p>
              <Link href="/founder/tools/new" className="btn-brand gap-2 mt-4"><Plus className="w-4 h-4" aria-hidden /> Submit a tool</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {tools.map((tool: any) => (
                <ListingCard key={tool.id} id={tool.id} slug={tool.slug} name={tool.name} tagline={tool.tagline} logoUrl={tool.logoUrl} status={tool.claimStatus} type="tool" />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Other portals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Link href="/founder/hiring" className={`${CARD} p-4 flex items-center gap-3 hover:border-gray-300 dark:hover:border-gray-700 transition-colors group`}>
          <span className="w-10 h-10 rounded-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0" aria-hidden><Briefcase className="w-5 h-5" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand transition-colors">Hiring? Post a job</span>
            <span className="block text-[13px] text-gray-600 dark:text-gray-400">Reach 45K+ AI professionals</span>
          </span>
        </Link>
        <a href="/organizer/login" className={`${CARD} p-4 flex items-center gap-3 hover:border-gray-300 dark:hover:border-gray-700 transition-colors group`}>
          <span className="w-10 h-10 rounded-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0" aria-hidden><CalendarDays className="w-5 h-5" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand transition-colors">Hosting an event? Create one</span>
            <span className="block text-[13px] text-gray-600 dark:text-gray-400">List your AI event for free</span>
          </span>
        </a>
      </div>
    </div>
  );
}

import { getOrganizerSession } from "@/lib/organizer-auth";
import { prisma } from "@udyaibase/database";
import { sql } from "@/lib/db";
import { BarChart3, Users, TrendingUp, Eye, Share2, Globe, Search, AtSign, Link2, CalendarDays, UserCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getOrganizerSession();
  if (!session) return null;

  const events = await prisma.event.findMany({
    where: { organizerId: session.id, deletedAt: null },
    select: { id: true, title: true, registrationCount: true, startAt: true, slug: true, shortCode: true },
    orderBy: { startAt: "desc" },
  });

  const totalRegs = events.reduce((s, e) => s + e.registrationCount, 0);
  const checkedIn = await prisma.eventRegistration.count({
    where: { event: { organizerId: session.id }, status: "CHECKED_IN", deletedAt: null },
  });

  let trafficSources = { direct: 0, search: 0, social: 0, email: 0, referral: 0 };
  let totalViews = 0;
  let totalShares = 0;
  let perEventAnalytics: any[] = [];

  try {
    const eventIds = events.map(e => e.id);
    if (eventIds.length > 0) {
      const sourceRows = await sql`
        SELECT
          COALESCE(SUM("directViews"), 0)::int AS direct,
          COALESCE(SUM("searchViews"), 0)::int AS search,
          COALESCE(SUM("socialViews"), 0)::int AS social,
          COALESCE(SUM("emailViews"), 0)::int AS email,
          COALESCE(SUM("referralViews"), 0)::int AS referral,
          COALESCE(SUM(views), 0)::int AS "totalViews",
          COALESCE(SUM(shares), 0)::int AS "totalShares"
        FROM "AnalyticsDaily"
        WHERE "entityType" = 'EVENT' AND "entityId" = ANY(${eventIds})
      `.catch(() => []);

      if (sourceRows.length > 0) {
        const s = sourceRows[0] as any;
        trafficSources = { direct: s.direct, search: s.search, social: s.social, email: s.email, referral: s.referral };
        totalViews = s.totalViews;
        totalShares = s.totalShares;
      }

      perEventAnalytics = await sql`
        SELECT
          "entityId" AS "eventId",
          COALESCE(SUM(views), 0)::int AS views,
          COALESCE(SUM(shares), 0)::int AS shares,
          COALESCE(SUM("socialViews"), 0)::int AS "socialViews",
          COALESCE(SUM("searchViews"), 0)::int AS "searchViews",
          COALESCE(SUM("directViews"), 0)::int AS "directViews"
        FROM "AnalyticsDaily"
        WHERE "entityType" = 'EVENT' AND "entityId" = ANY(${eventIds})
        GROUP BY "entityId"
      `.catch(() => []);
    }
  } catch {}

  const totalSourceViews = trafficSources.direct + trafficSources.search + trafficSources.social + trafficSources.email + trafficSources.referral;
  const analyticsMap = new Map(perEventAnalytics.map((a: any) => [a.eventId, a]));
  const conversionRate = totalViews > 0 ? ((totalRegs / totalViews) * 100).toFixed(1) : '—';

  const statCards = [
    { label: 'Events', value: events.length, icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Page Views', value: totalViews, icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: 'Registrations', value: totalRegs, icon: Users, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Checked In', value: checkedIn, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Shares', value: totalShares, icon: Share2, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-900/20' },
    { label: 'Conversion', value: conversionRate === '—' ? '—' : `${conversionRate}%`, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  ];

  const sourceBreakdown = [
    { label: 'Direct', value: trafficSources.direct, icon: Globe, color: 'bg-blue-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.direct / totalSourceViews) * 100) : 0 },
    { label: 'Search (Google)', value: trafficSources.search, icon: Search, color: 'bg-green-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.search / totalSourceViews) * 100) : 0 },
    { label: 'Social Media', value: trafficSources.social, icon: Share2, color: 'bg-purple-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.social / totalSourceViews) * 100) : 0 },
    { label: 'Email', value: trafficSources.email, icon: AtSign, color: 'bg-amber-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.email / totalSourceViews) * 100) : 0 },
    { label: 'Referral', value: trafficSources.referral, icon: Link2, color: 'bg-cyan-500', pct: totalSourceViews > 0 ? Math.round((trafficSources.referral / totalSourceViews) * 100) : 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand" />
          Event Analytics
        </h1>
        <p className="portal-subtitle">Track event performance, traffic sources & registrations</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-sora font-extrabold text-navy dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-500 font-jakarta truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Sources */}
        <div data-tour="analytics-traffic" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5">
          <h2 className="portal-section-title mb-4">Traffic Sources</h2>
          {totalSourceViews === 0 ? (
            <p className="text-xs text-gray-400 font-jakarta">No UTM data yet. Share your event links to start tracking traffic sources.</p>
          ) : (
            <div className="space-y-3">
              {sourceBreakdown.map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <s.icon className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-jakarta text-gray-700 dark:text-gray-300">{s.label}</span>
                    </div>
                    <span className="text-xs font-bold font-jakarta text-navy dark:text-white">{s.value} <span className="text-gray-400 font-normal">({s.pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Registration Funnel */}
        <div data-tour="analytics-funnel" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5">
          <h2 className="portal-section-title mb-4">Registration Funnel</h2>
          <div className="space-y-3">
            {[
              { label: 'Page Views', value: totalViews, pct: 100, color: 'bg-blue-500' },
              { label: 'Registrations', value: totalRegs, pct: totalViews > 0 ? Math.round((totalRegs / totalViews) * 100) : 0, color: 'bg-green-500' },
              { label: 'Checked In', value: checkedIn, pct: totalRegs > 0 ? Math.round((checkedIn / totalRegs) * 100) : 0, color: 'bg-emerald-500' },
            ].map((step) => (
              <div key={step.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-jakarta text-gray-700 dark:text-gray-300">{step.label}</span>
                  <span className="text-xs font-bold font-jakarta text-navy dark:text-white">{step.value} <span className="text-gray-400 font-normal">({step.pct}%)</span></span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${step.color} rounded-full transition-all`} style={{ width: `${step.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-Event Performance Table */}
      <div data-tour="analytics-performance" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5">
        <h2 className="portal-section-title mb-4">Event Performance</h2>
        {events.length === 0 ? (
          <p className="text-xs text-gray-400 font-jakarta text-center py-6">No events yet. Create an event to see analytics.</p>
        ) : (
          <>
          <ul className="md:hidden -mx-1 divide-y divide-gray-100 dark:divide-gray-800">
            {events.map((e) => {
              const a = analyticsMap.get(e.id) || { views: 0, shares: 0, socialViews: 0, searchViews: 0 };
              const conv = a.views > 0 ? ((e.registrationCount / a.views) * 100).toFixed(1) + '%' : '—';
              return (
                <li key={e.id} className="px-1 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta truncate">{e.title}</p>
                    <p className="text-xs text-gray-400 font-jakarta shrink-0">
                      {new Date(e.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {[
                      { k: "Views", v: a.views, c: "text-navy dark:text-white" },
                      { k: "Registrations", v: e.registrationCount, c: "text-green-600" },
                      { k: "Conversion", v: conv, c: "text-amber-600" },
                    ].map((m) => (
                      <div key={m.k} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 py-2">
                        <dd className={`text-base font-bold font-sora ${m.c}`}>{m.v}</dd>
                        <dt className="text-[11px] text-gray-500 font-jakarta">{m.k}</dt>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-gray-500 font-jakarta">
                    {a.shares} shares · {a.socialViews} from social · {a.searchViews} from search
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs font-jakarta">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-2 pr-4 font-medium">Event</th>
                  <th className="pb-2 px-2 font-medium text-center">Date</th>
                  <th className="pb-2 px-2 font-medium text-center">Views</th>
                  <th className="pb-2 px-2 font-medium text-center">Regs</th>
                  <th className="pb-2 px-2 font-medium text-center">Conv.</th>
                  <th className="pb-2 px-2 font-medium text-center">Shares</th>
                  <th className="pb-2 px-2 font-medium text-center">Social</th>
                  <th className="pb-2 pl-2 font-medium text-center">Search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {events.map((e) => {
                  const a = analyticsMap.get(e.id) || { views: 0, shares: 0, socialViews: 0, searchViews: 0 };
                  const conv = a.views > 0 ? ((e.registrationCount / a.views) * 100).toFixed(1) + '%' : '—';
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300 truncate max-w-[200px] font-medium">{e.title}</td>
                      <td className="py-2.5 px-2 text-center text-gray-400">
                        {new Date(e.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </td>
                      <td className="py-2.5 px-2 text-center text-navy dark:text-white font-semibold">{a.views}</td>
                      <td className="py-2.5 px-2 text-center text-green-600 font-semibold">{e.registrationCount}</td>
                      <td className="py-2.5 px-2 text-center text-amber-500 font-semibold">{conv}</td>
                      <td className="py-2.5 px-2 text-center text-pink-500">{a.shares}</td>
                      <td className="py-2.5 px-2 text-center text-purple-500">{a.socialViews}</td>
                      <td className="py-2.5 pl-2 text-center text-green-500">{a.searchViews}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

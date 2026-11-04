import { requireFounderAuth } from '@/lib/founder-auth';
import { roleForOwner } from '@/lib/founder/access';
import { prisma } from '@udyaibase/database';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Eye, MousePointerClick, Bookmark, Star, TrendingUp, ArrowUpRight } from 'lucide-react';

export default async function ToolAnalyticsPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const session = await requireFounderAuth();

  // Fetch tool with ownership check
  const tools = await prisma.$queryRaw<any[]>`
    SELECT id, name, slug, "logoUrl", "avgRating", "reviewCount", "listingTier", "ownerId"
    FROM "AiTool"
    WHERE slug = ${params.slug} AND "deletedAt" IS NULL
    LIMIT 1
  `;

  const tool = tools[0];
  if (!tool || !(await roleForOwner(session, tool.ownerId))) notFound();

  // Fetch analytics data in parallel
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    currentMonthClicks,
    lastMonthClicks,
    allTimeClicks,
    savedCount,
    reviewCount,
    dailyClicks,
    upvotesTotal,
    upvotesThisMonth,
    upvotesLastMonth,
  ] = await Promise.all([
    // Current month clicks
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count
      FROM "AffiliateClick"
      WHERE "toolId" = ${tool.id} AND "createdAt" >= ${startOfMonth}
    `,
    // Last month clicks
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count
      FROM "AffiliateClick"
      WHERE "toolId" = ${tool.id} AND "createdAt" >= ${startOfLastMonth} AND "createdAt" < ${startOfMonth}
    `,
    // All time clicks
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count
      FROM "AffiliateClick"
      WHERE "toolId" = ${tool.id}
    `,
    // Bookmark/save count
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count
      FROM "SavedTool"
      WHERE "toolSlug" = ${tool.slug}
    `,
    // Review count
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0) AS avg
      FROM "ToolReview"
      WHERE "toolId" = ${tool.id}
    `,
    // Daily clicks (last 30 days)
    prisma.$queryRaw<any[]>`
      SELECT DATE("createdAt") AS date, COUNT(*)::int AS clicks
      FROM "AffiliateClick"
      WHERE "toolId" = ${tool.id} AND "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    // Upvotes: total
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count FROM "ToolUpvote" WHERE "toolId" = ${tool.id}
    `,
    // Upvotes: this month
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count FROM "ToolUpvote" WHERE "toolId" = ${tool.id} AND "createdAt" >= ${startOfMonth}
    `,
    // Upvotes: last month
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count FROM "ToolUpvote" WHERE "toolId" = ${tool.id} AND "createdAt" >= ${startOfLastMonth} AND "createdAt" < ${startOfMonth}
    `,
  ]);

  const currentClicks = currentMonthClicks[0]?.count || 0;
  const lastClicks = lastMonthClicks[0]?.count || 0;
  const totalClicks = allTimeClicks[0]?.count || 0;
  const saves = savedCount[0]?.count || 0;
  const reviews = reviewCount[0]?.count || 0;
  const avgRating = parseFloat(reviewCount[0]?.avg || '0');
  const upvotes = upvotesTotal[0]?.count || 0;
  const upvotesCurrentMonth = upvotesThisMonth[0]?.count || 0;
  const upvotesPrevMonth = upvotesLastMonth[0]?.count || 0;
  const upvoteChange = upvotesPrevMonth > 0
    ? Math.round(((upvotesCurrentMonth - upvotesPrevMonth) / upvotesPrevMonth) * 100)
    : upvotesCurrentMonth > 0 ? 100 : 0;

  const clickChange = lastClicks > 0
    ? Math.round(((currentClicks - lastClicks) / lastClicks) * 100)
    : currentClicks > 0 ? 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/founder/tools"
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </Link>
        <div className="flex items-center gap-3">
          {tool.logoUrl && (
            <Image src={tool.logoUrl} alt="" width={40} height={40} sizes="40px" className="w-10 h-10 rounded-xl object-contain border border-gray-200 dark:border-gray-700 bg-white p-1" />
          )}
          <div>
            <h1 className="portal-title">{tool.name} Analytics</h1>
            <p className="portal-subtitle">Performance overview</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Website Clicks"
          value={totalClicks}
          sublabel={`${currentClicks} this month`}
          change={clickChange}
          icon={MousePointerClick}
        />
        <StatCard
          label="Upvotes"
          value={upvotes}
          sublabel={`${upvotesCurrentMonth} this month`}
          change={upvoteChange}
          icon={TrendingUp}
        />
        <StatCard
          label="Bookmarks"
          value={saves}
          icon={Bookmark}
        />
        <StatCard
          label="Reviews"
          value={reviews}
          sublabel={avgRating > 0 ? `${avgRating.toFixed(1)} avg rating` : undefined}
          icon={Star}
        />
        <StatCard
          label="Listing Tier"
          value={tool.listingTier || 'FREE'}
          isText
          icon={TrendingUp}
        />
      </div>

      {/* Daily Clicks Chart (simple bar representation) */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="portal-section-title mb-4">Clicks to your website (last 30 days)</h2>
        {dailyClicks.length > 0 ? (
          <div className="flex items-end gap-1 h-32">
            {(() => {
              const maxClicks = Math.max(...dailyClicks.map((d: any) => d.clicks), 1);
              return dailyClicks.map((day: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div
                    className="w-full bg-brand/80 rounded-t-sm min-h-[2px]"
                    style={{ height: `${(day.clicks / maxClicks) * 100}%` }}
                    title={`${new Date(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}: ${day.clicks} clicks`}
                  />
                </div>
              ));
            })()}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-sm text-gray-400">
            No click data yet. Share your tool listing to start getting traffic.
          </div>
        )}
      </div>

      {/* Upgrade CTA */}
      {tool.listingTier === 'FREE' && totalClicks > 0 && (
        <div className="bg-gradient-to-r from-brand/5 to-purple-50 dark:from-brand/10 dark:to-purple-900/10 border border-brand/20 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Boost your visibility</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Your tool was clicked {totalClicks} times. Want more people to see it? Promote it on the homepage, in the newsletter or in featured spots.
              </p>
            </div>
            <Link
              href="/advertise"
              className="shrink-0 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand/90 transition-colors flex items-center gap-1"
            >
              See options <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sublabel, change, icon: Icon, isText }: {
  label: string;
  value: number | string;
  sublabel?: string;
  change?: number;
  icon: any;
  isText?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        {change !== undefined && change !== 0 && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            change > 0
              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            {change > 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <p className={`font-bold text-gray-900 dark:text-white ${isText ? 'text-sm' : 'text-2xl'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
      {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

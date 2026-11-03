import { prisma } from '@udyaibase/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import Greeting from '@/components/shared/Greeting';
import {
  FileText,
  Users,
  TrendingUp,
  AlertCircle,
  Clock,
  Edit3,
  CheckCircle,
  Wrench,
  Building2,
  Mail,
  CalendarDays,
  Megaphone,
  UserPlus,
} from 'lucide-react';

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userName = session?.user?.name?.split(' ')[0] || 'Admin';

  const [
    totalArticles,
    publishedCount,
    pendingReviews,
    totalStartups,
    pendingStartups,
    totalTools,
    pendingTools,
    totalSubscribers,
    confirmedSubscribers,
    totalEvents,
    totalWebUsers,
    totalFounders,
  ] = await Promise.all([
    // Deleted rows are soft-deleted (deletedAt set) and stay in the tables, so every count excludes them.
    prisma.article.count({ where: { deletedAt: null } }),
    prisma.article.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
    prisma.article.count({ where: { deletedAt: null, status: 'IN_REVIEW' } }),
    prisma.startup.count({ where: { deletedAt: null } }),
    prisma.startup.count({ where: { deletedAt: null, isApproved: false } }),
    prisma.aiTool.count({ where: { deletedAt: null } }),
    prisma.aiTool.count({ where: { deletedAt: null, status: 'PENDING' } }),
    // Total matches the Subscribers page heading; the badge uses its "Active" rule (active and email confirmed).
    prisma.newsletterSubscriber.count(),
    prisma.newsletterSubscriber.count({ where: { isActive: true, emailVerified: true } }),
    prisma.event.count({ where: { deletedAt: null } }),
    prisma.webUser.count({ where: { deletedAt: null } }),
    prisma.unifiedUser.count({ where: { founderProfile: { isNot: null } } }),
  ]);

  const totalPendingApprovals = pendingStartups + pendingTools + pendingReviews;

  const metrics = [
    {
      label: 'Articles',
      value: totalArticles.toString(),
      badge: `${publishedCount} Published`,
      icon: FileText,
    },
    {
      label: 'Startups',
      value: totalStartups.toString(),
      badge: pendingStartups > 0 ? `${pendingStartups} Pending` : undefined,
      icon: Building2,
    },
    {
      label: 'AI Tools',
      value: totalTools.toString(),
      badge: pendingTools > 0 ? `${pendingTools} Pending` : undefined,
      icon: Wrench,
    },
    {
      label: 'Subscribers',
      value: totalSubscribers.toLocaleString(),
      badge: `${confirmedSubscribers.toLocaleString()} Confirmed`,
      icon: Mail,
    },
    {
      label: 'Events',
      value: totalEvents.toString(),
      icon: CalendarDays,
    },
    {
      label: 'Pending Approvals',
      value: totalPendingApprovals.toString(),
      urgent: totalPendingApprovals > 0,
      icon: AlertCircle,
    },
  ];

  const recentArticles = await prisma.article.findMany({
    where: { deletedAt: null },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      User: {
        select: { name: true }
      }
    }
  });

  const recentActivity = recentArticles.map((a: any) => ({
    user: a.User?.name || 'Unknown',
    action: a.status === 'PUBLISHED' ? 'Published' : a.status === 'IN_REVIEW' ? 'Submitted for review' : 'Updated',
    item: a.title,
    time: formatRelativeTime(a.createdAt),
    type: a.status === 'PUBLISHED' ? 'publish' : a.status === 'IN_REVIEW' ? 'submit' : 'draft'
  }));

  const scheduledArticlesRaw = await prisma.article.findMany({
    where: { status: 'SCHEDULED', deletedAt: null },
    take: 5,
    orderBy: { scheduledAt: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledAt: true,
    }
  });

  const scheduledArticles = scheduledArticlesRaw.map(a => ({
    title: a.title,
    date: a.scheduledAt
      ? a.scheduledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Upcoming',
    status: 'scheduled'
  }));

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">
            <Greeting name={userName} />
          </h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            {todayFormatted} &mdash; Here&apos;s your platform overview.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/articles/new"
            className="btn-brand text-sm flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            New Article
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((metric, i) => (
          <div
            key={i}
            className={`bg-white dark:bg-gray-900 rounded-xl border p-5 ${'urgent' in metric && metric.urgent
              ? 'border-brand/30 bg-brand-50/30 dark:bg-brand-900/10'
              : 'border-gray-100 dark:border-gray-800'
              }`}
          >
            <div className="flex items-center justify-between mb-3">
              <metric.icon
                className={`w-5 h-5 ${'urgent' in metric && metric.urgent ? 'text-brand' : 'text-gray-400 dark:text-gray-500'
                  }`}
              />
            </div>
            <p className="font-sora font-extrabold text-xl text-navy dark:text-white">{metric.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-jakarta mt-1">{metric.label}</p>
            {'badge' in metric && metric.badge && (
              <span className="inline-block mt-2 text-[10px] font-semibold bg-brand/10 text-brand px-2 py-0.5 rounded-full">
                {metric.badge}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">No recent activity found.</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.type === 'publish'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : item.type === 'submit'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}
                  >
                    {item.type === 'publish' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Edit3 className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-jakarta">
                      <span className="font-semibold text-navy dark:text-white">{item.user}</span>{' '}
                      <span className="text-gray-500 dark:text-gray-400">{item.action}</span>{' '}
                      <span className="font-medium text-navy dark:text-white">{item.item}</span>
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scheduled Articles */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">Upcoming Schedule</h2>
            {scheduledArticles.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">No articles scheduled yet.</p>
            ) : (
              <div className="space-y-3">
                {scheduledArticles.map((article, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-brand-50/30 dark:hover:bg-brand-900/10 transition-colors cursor-pointer"
                  >
                    <h4 className="font-sora font-semibold text-sm text-navy dark:text-white">{article.title}</h4>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-jakarta flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {article.date}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {article.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="font-sora font-semibold text-sm text-navy dark:text-white mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/articles/new"
                className="p-3 rounded-lg bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 text-center transition-colors"
              >
                <Edit3 className="w-4 h-4 text-brand mx-auto mb-1" />
                <span className="text-xs font-medium text-navy dark:text-white font-jakarta">New Article</span>
              </Link>
              <Link
                href="/tools-dir"
                className="p-3 rounded-lg bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 text-center transition-colors"
              >
                <Wrench className="w-4 h-4 text-brand mx-auto mb-1" />
                <span className="text-xs font-medium text-navy dark:text-white font-jakarta">Add Tool</span>
              </Link>
              <Link
                href="/startups-dir/new"
                className="p-3 rounded-lg bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 text-center transition-colors"
              >
                <Building2 className="w-4 h-4 text-brand mx-auto mb-1" />
                <span className="text-xs font-medium text-navy dark:text-white font-jakarta">Add Startup</span>
              </Link>
              <Link
                href="/newsletter-admin"
                className="p-3 rounded-lg bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 text-center transition-colors"
              >
                <Mail className="w-4 h-4 text-brand mx-auto mb-1" />
                <span className="text-xs font-medium text-navy dark:text-white font-jakarta">New Campaign</span>
              </Link>
              <Link
                href="/subscribers"
                className="p-3 rounded-lg bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 text-center transition-colors"
              >
                <Users className="w-4 h-4 text-brand mx-auto mb-1" />
                <span className="text-xs font-medium text-navy dark:text-white font-jakarta">Subscribers</span>
              </Link>
              <Link
                href="/people"
                className="p-3 rounded-lg bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 text-center transition-colors"
              >
                <UserPlus className="w-4 h-4 text-brand mx-auto mb-1" />
                <span className="text-xs font-medium text-navy dark:text-white font-jakarta">People</span>
              </Link>
            </div>

            {/* Platform stats */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="font-sora font-bold text-lg text-navy dark:text-white">{totalFounders}</p>
                  <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wide">Founders</p>
                </div>
                <div>
                  <p className="font-sora font-bold text-lg text-navy dark:text-white">{totalWebUsers}</p>
                  <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wide">Web Users</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

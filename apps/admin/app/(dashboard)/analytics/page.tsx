'use client';

import { useState, useEffect } from 'react';
import { Eye, ArrowUpRight, Clock, TrendingUp, Globe, Monitor, Smartphone, Users, Calendar, FileText, Megaphone, Mail, Loader2 } from 'lucide-react';
import { getAnalyticsDataAction } from './actions';

const periods = ['7 days', '30 days', '90 days', 'This year'];

interface AnalyticsData {
  metrics: {
    pageviews: number; uniqueVisitors: number; avgSession: string; bounceRate: string;
    totalArticles: number; avgReadTime: string; totalImpressions: number; totalClicks: number;
    ctr: string; activeCampaigns: number; totalSubscribers: number; newSubscribers: number;
    totalUsers: number; activeUsers: number;
  };
  topArticles: Array<{ title: string; slug: string; views: number; type: string; author: string; category: string; }>;
  referrers: Array<{ source: string; visits: number; pct: number; }>;
  devices: Array<{ type: string; pct: number; }>;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('7 days');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAnalyticsDataAction(period);
        console.log('Analytics response:', res);
        if (res.success) {
          setData(res.data as AnalyticsData);
        } else {
          setError(res.error || 'Failed to load analytics data');
        }
      } catch (err: any) {
        console.error('Analytics error:', err);
        setError(err.message || 'Failed to load analytics data');
      }
      setLoading(false);
    };
    loadData();
  }, [period]);

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-brand" />
    </div>
  );

  if (!data) return (
    <div className="text-center py-20">
      <p className="text-gray-400">Failed to load analytics data</p>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );

  const deviceIcons = { Desktop: Monitor, Mobile: Smartphone, Other: Globe };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Analytics</h1>
          <p className="portal-subtitle">Traffic and engagement overview</p>
        </div>
        <div className="flex items-center gap-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1">
          {periods.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${p === period ? 'bg-brand text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pageviews', value: data.metrics.pageviews.toLocaleString(), icon: Eye, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Unique Visitors', value: data.metrics.uniqueVisitors.toLocaleString(), icon: Users, color: 'text-green-600 dark:text-green-400' },
          { label: 'Avg. Session', value: data.metrics.avgSession, icon: Clock, color: 'text-purple-600 dark:text-purple-400' },
          { label: 'Bounce Rate', value: data.metrics.bounceRate, icon: TrendingUp, color: 'text-orange-600 dark:text-orange-400' },
        ].map((m) => (
          <div key={m.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
            <m.icon className={`w-5 h-5 mb-3 ${m.color}`} />
            <p className="font-sora font-extrabold text-xl text-navy dark:text-white">{m.value}</p>
            <p className="text-xs text-gray-400 font-jakarta mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Content & Business Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Articles Published', value: data.metrics.totalArticles.toString(), icon: FileText, color: 'text-brand' },
          { label: 'Ad Impressions', value: data.metrics.totalImpressions.toLocaleString(), icon: Megaphone, color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Newsletter Subscribers', value: data.metrics.totalSubscribers.toLocaleString(), icon: Mail, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Active Users', value: data.metrics.activeUsers.toString(), icon: Users, color: 'text-pink-600 dark:text-pink-400' },
        ].map((m) => (
          <div key={m.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
            <m.icon className={`w-5 h-5 mb-3 ${m.color}`} />
            <p className="font-sora font-extrabold text-xl text-navy dark:text-white">{m.value}</p>
            <p className="text-xs text-gray-400 font-jakarta mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Articles */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4">Top Articles ({period})</h2>
          {data.topArticles.length === 0 ? (
            <p className="text-sm text-gray-400 font-jakarta text-center py-6">No articles published in this period</p>
          ) : (
            <div className="space-y-3">
              {data.topArticles.map((article, i) => (
                <div key={article.slug} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-xs text-gray-300 dark:text-gray-600 font-sora font-bold text-right">{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-navy dark:text-white font-jakarta line-clamp-1">{article.title}</p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 font-jakarta mt-0.5">
                        <span>{article.type}</span>
                        {article.author && <><span>•</span><span>{article.author}</span></>}
                        {article.category && <><span>•</span><span>{article.category}</span></>}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-navy dark:text-white font-sora">{article.views.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Traffic Sources */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4">Traffic Sources</h2>
            <div className="space-y-3">
              {data.referrers.map((r) => (
                <div key={r.source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">{r.source}</span>
                    <span className="text-sm font-sora font-bold text-brand">{r.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Devices */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4">Devices</h2>
            <div className="space-y-3">
              {data.devices.map((d) => {
                const Icon = deviceIcons[d.type as keyof typeof deviceIcons] || Globe;
                return (
                  <div key={d.type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">{d.type}</span>
                    </div>
                    <span className="text-sm font-sora font-bold text-navy dark:text-white">{d.pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4">Quick Stats</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">Avg. Read Time</span>
                <span className="text-sm font-sora font-bold text-navy dark:text-white">{data.metrics.avgReadTime}m</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">Ad CTR</span>
                <span className="text-sm font-sora font-bold text-brand">{data.metrics.ctr}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">Active Campaigns</span>
                <span className="text-sm font-sora font-bold text-navy dark:text-white">{data.metrics.activeCampaigns}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">New Subscribers</span>
                <span className="text-sm font-sora font-bold text-green-600 dark:text-green-400">+{data.metrics.newSubscribers}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
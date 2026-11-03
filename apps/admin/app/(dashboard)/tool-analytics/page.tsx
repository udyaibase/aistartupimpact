'use client';

import { useState, useEffect } from 'react';
import { 
  MousePointerClick, TrendingUp, Users, Zap, Monitor, Smartphone, 
  Globe, Download, Loader2, BarChart3, PieChart, MapPin, Chrome,
  ExternalLink, Calendar
} from 'lucide-react';
import { getToolClickAnalyticsAction, exportToolClicksAction } from './actions';
import Link from 'next/link';

const periods = ['7 days', '30 days', '90 days', 'This year'];

interface AnalyticsData {
  overview: {
    totalClicks: number;
    uniqueSessions: number;
    uniqueTools: number;
    avgClicksPerSession: string;
  };
  trafficSent: {
    totalOutboundClicks: number;
    toolsReceivingTraffic: number;
    topReferredTool: string;
  };
  topTools: Array<{
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    category: string;
    clicks: number;
    profileClicks: number;
    profileViews: number;
    ctr: string | null;
  }>;
  sourcePerformance: Array<{
    source: string;
    clicks: number;
    percentage: number;
  }>;
  deviceBreakdown: Array<{
    device: string;
    clicks: number;
    percentage: number;
  }>;
  browserBreakdown: Array<{
    browser: string;
    clicks: number;
    percentage: number;
  }>;
  countryBreakdown: Array<{
    country: string;
    clicks: number;
    percentage: number;
  }>;
  dailyTrend: Array<{
    date: string;
    clicks: number;
  }>;
}

export default function ToolAnalyticsPage() {
  const [period, setPeriod] = useState('7 days');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getToolClickAnalyticsAction(period)
      .then(res => {
        if (cancelled) return;
        if (res.success) {
          setData(res.data as AnalyticsData);
        } else {
          setError(res.error || 'Failed to load analytics');
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportToolClicksAction(period);
      if (res.success && res.data) {
        // Convert to CSV
        const headers = ['Date', 'Tool', 'Category', 'Source', 'Device', 'Browser', 'OS', 'Country'];
        const rows = res.data.map((row: any) => [
          row.date,
          row.tool,
          row.category,
          row.source,
          row.device,
          row.browser,
          row.os,
          row.country
        ]);
        
        const csv = [
          headers.join(','),
          ...rows.map((row: any[]) => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tool-clicks-${period.replace(' ', '-')}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
    setExporting(false);
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Failed to load analytics</p>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  const sourceIcons: Record<string, any> = {
    TOOL_DETAIL: ExternalLink,
    DIRECTORY: BarChart3,
    HOMEPAGE: Globe,
    SEARCH: Globe,
    RELATED: Zap,
    COMPARISON: PieChart,
    OTHER: Globe
  };

  const deviceIcons: Record<string, any> = {
    DESKTOP: Monitor,
    MOBILE: Smartphone,
    TABLET: Smartphone,
  };

  return (
    <div className={`space-y-6 ${loading ? 'opacity-60 pointer-events-none' : ''} transition-opacity`}>
      {loading && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 shadow-lg pointer-events-auto">
          <Loader2 className="w-4 h-4 animate-spin text-brand" />
          <span className="text-xs font-jakarta text-gray-500">Updating...</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between pointer-events-auto">
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">Tool Click Analytics</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            Track tool clicks across all sources
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={exporting || data.overview.totalClicks === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export CSV
          </button>

          {/* Period Selector */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1">
            {periods.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  p === period
                    ? 'bg-brand text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Clicks',
            value: data.overview.totalClicks.toLocaleString(),
            icon: MousePointerClick,
            color: 'text-blue-600 dark:text-blue-400'
          },
          {
            label: 'Unique Sessions',
            value: data.overview.uniqueSessions.toLocaleString(),
            icon: Users,
            color: 'text-green-600 dark:text-green-400'
          },
          {
            label: 'Tools Clicked',
            value: data.overview.uniqueTools.toLocaleString(),
            icon: Zap,
            color: 'text-purple-600 dark:text-purple-400'
          },
          {
            label: 'Avg. Clicks/Session',
            value: data.overview.avgClicksPerSession,
            icon: TrendingUp,
            color: 'text-orange-600 dark:text-orange-400'
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5"
          >
            <metric.icon className={`w-5 h-5 mb-3 ${metric.color}`} />
            <p className="font-sora font-extrabold text-xl text-navy dark:text-white">
              {metric.value}
            </p>
            <p className="text-xs text-gray-400 font-jakarta mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* Traffic Sent Banner */}
      <div className="bg-gradient-to-r from-brand/10 via-purple-500/5 to-blue-500/10 dark:from-brand/20 dark:via-purple-500/10 dark:to-blue-500/20 rounded-xl border border-brand/20 p-5">
        <h2 className="font-sora font-bold text-sm text-brand mb-3 uppercase tracking-wider">Traffic Sent — All Time</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="font-sora font-extrabold text-2xl text-navy dark:text-white">
              {data.trafficSent.totalOutboundClicks.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 font-jakarta mt-0.5">Total outbound clicks</p>
          </div>
          <div>
            <p className="font-sora font-extrabold text-2xl text-navy dark:text-white">
              {data.trafficSent.toolsReceivingTraffic.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 font-jakarta mt-0.5">Tools receiving traffic</p>
          </div>
          <div>
            <p className="font-sora font-extrabold text-2xl text-navy dark:text-white truncate">
              {data.trafficSent.topReferredTool}
            </p>
            <p className="text-xs text-gray-500 font-jakarta mt-0.5">Top referred tool</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Tools */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand" />
            Top Performing Tools
          </h2>
          {data.topTools.length === 0 ? (
            <p className="text-sm text-gray-400 font-jakarta text-center py-6">
              No clicks recorded in this period
            </p>
          ) : (
            <div className="space-y-3">
              {data.topTools.map((tool, i) => (
                <div key={tool.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-6 text-xs text-gray-300 dark:text-gray-600 font-sora font-bold text-right">
                      {i + 1}
                    </span>
                    <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700">
                      {tool.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tool.logoUrl}
                          alt={tool.name}
                          className="w-8 h-8 object-contain"
                        />
                      ) : (
                        <Zap className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/tools-dir/${tool.id}/edit`}
                        className="text-sm font-semibold text-navy dark:text-white font-jakarta line-clamp-1 hover:text-brand transition-colors"
                      >
                        {tool.name}
                      </Link>
                      <p className="text-[11px] text-gray-400 font-jakarta">{tool.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-sm font-bold text-navy dark:text-white font-sora block">{tool.clicks.toLocaleString()} clicks</span>
                      <span
                        className="text-xs text-gray-400 font-jakarta"
                        title="Clicks from this tool's page ÷ views of that page. Clicks from the homepage or search don't need a page view, so total clicks can be higher than views."
                      >
                        {tool.profileClicks.toLocaleString()} from page · {tool.profileViews.toLocaleString()} page views
                      </span>
                    </div>
                    <span
                      title="Page CTR: clicks on the tool page ÷ views of the tool page"
                      className={`text-xs font-bold font-sora px-2 py-0.5 rounded-full ${
                      tool.ctr === null ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' :
                      parseFloat(tool.ctr) >= 10 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      parseFloat(tool.ctr) >= 5 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                      'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}>
                      {tool.ctr === null ? 'No page views' : `${tool.ctr}% CTR`}
                    </span>
                    <Link
                      href={`/tools/${tool.slug}`}
                      target="_blank"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-400 hover:text-brand" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Click Sources */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand" />
            Click Sources
          </h2>
          <div className="space-y-3">
            {data.sourcePerformance.map((source) => {
              const Icon = sourceIcons[source.source] || Globe;
              return (
                <div key={source.source}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">
                        {source.source.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-sm font-sora font-bold text-brand">
                      {source.percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-500"
                      style={{ width: `${source.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {source.clicks.toLocaleString()} clicks
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Device, Browser, Country Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Devices */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-brand" />
            Devices
          </h2>
          <div className="space-y-3">
            {data.deviceBreakdown.map((device) => {
              const Icon = deviceIcons[device.device] || Monitor;
              return (
                <div key={device.device} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">
                      {device.device}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-sora font-bold text-navy dark:text-white">
                      {device.percentage}%
                    </span>
                    <p className="text-xs text-gray-400">{device.clicks}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Browsers */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4 flex items-center gap-2">
            <Chrome className="w-5 h-5 text-brand" />
            Browsers
          </h2>
          <div className="space-y-3">
            {data.browserBreakdown.map((browser) => (
              <div key={browser.browser} className="flex items-center justify-between">
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">
                  {browser.browser}
                </span>
                <div className="text-right">
                  <span className="text-sm font-sora font-bold text-navy dark:text-white">
                    {browser.percentage}%
                  </span>
                  <p className="text-xs text-gray-400">{browser.clicks}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Countries */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-brand" />
            Top Countries
          </h2>
          <div className="space-y-3">
            {data.countryBreakdown.slice(0, 5).map((country) => (
              <div key={country.country} className="flex items-center justify-between">
                <span className="text-sm font-jakarta text-gray-700 dark:text-gray-300">
                  {country.country}
                </span>
                <div className="text-right">
                  <span className="text-sm font-sora font-bold text-navy dark:text-white">
                    {country.percentage}%
                  </span>
                  <p className="text-xs text-gray-400">{country.clicks}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Trend — compact bar chart */}
      {data.dailyTrend.length > 0 && (() => {
        const maxClicks = Math.max(...data.dailyTrend.map(d => d.clicks));
        const totalInPeriod = data.dailyTrend.reduce((s, d) => s + d.clicks, 0);
        const labelInterval = data.dailyTrend.length <= 14 ? 1 : data.dailyTrend.length <= 31 ? 3 : 7;
        return (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-sora font-bold text-base text-navy dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand" />
                Daily Trend
              </h2>
              <span className="text-xs text-gray-400 font-jakarta">
                {totalInPeriod.toLocaleString()} clicks · {data.dailyTrend.length} days
              </span>
            </div>
            <div className="flex items-end gap-px h-40" title="Daily clicks">
              {data.dailyTrend.map((day, i) => {
                const pct = maxClicks > 0 ? (day.clicks / maxClicks) * 100 : 0;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center group relative min-w-0">
                    <div className="w-full flex justify-center" style={{ height: '160px', alignItems: 'flex-end' }}>
                      <div
                        className="w-full max-w-[20px] bg-brand/70 hover:bg-brand rounded-t transition-colors cursor-pointer"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                      <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap font-jakarta">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {day.clicks} clicks
                      </div>
                      <div className="w-1.5 h-1.5 bg-gray-900 dark:bg-gray-100 rotate-45 -mt-0.5" />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* X-axis labels */}
            <div className="flex gap-px mt-1.5">
              {data.dailyTrend.map((day, i) => (
                <div key={day.date} className="flex-1 min-w-0 text-center">
                  {i % labelInterval === 0 ? (
                    <span className="text-[9px] text-gray-400 font-jakarta">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

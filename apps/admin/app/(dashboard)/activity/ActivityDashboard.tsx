'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  Shield,
  Trash2,
  Plus,
  Edit3,
  Clock,
  Users,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Building2,
  Wrench,
  FileText,
  CalendarDays,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { notify } from '@/components/Toast';

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: any;
  after: any;
  ipAddress: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  userRole: string;
  userAvatar: string | null;
}

interface UserActivity {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  userAvatar: string | null;
  totalActions: number;
  creates: number;
  updates: number;
  deletes: number;
  lastActivity: string | null;
}

interface Stats {
  userActivity: UserActivity[];
  resourceActivity: { resourceType: string; total: number; creates: number; updates: number; deletes: number }[];
  recentDeletes: AuditLog[];
  dailyActivity: { date: string; total: number }[];
  totals: { allTime: number; last24h: number; last7d: number; last30d: number };
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  RESTORE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  APPROVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  PUBLISH: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  UNPUBLISH: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  FEATURE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  UNFEATURE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const ACTION_ICONS: Record<string, any> = {
  CREATE: Plus,
  UPDATE: Edit3,
  DELETE: Trash2,
  RESTORE: RefreshCw,
  APPROVE: Shield,
  PUBLISH: FileText,
};

const RESOURCE_ICONS: Record<string, any> = {
  STARTUP: Building2,
  AI_TOOL: Wrench,
  ARTICLE: FileText,
  EVENT: CalendarDays,
  NEWSLETTER: Mail,
  USER: Users,
};

function formatRelativeTime(dateStr: string) {
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr.trim() + 'Z';
  const date = new Date(normalized);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
}

function formatFullDateTime(dateStr: string) {
  // DB returns timestamps without timezone suffix — they are UTC
  // Append Z to ensure JavaScript parses them as UTC before converting to IST
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr.trim() + 'Z';
  const date = new Date(normalized);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }) + ' at ' + date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function getResourceName(log: AuditLog): string {
  if (log.after?.name) return log.after.name;
  if (log.before?.name) return log.before.name;
  if (log.after?.title) return log.after.title;
  if (log.before?.title) return log.before.title;
  return log.resourceId?.substring(0, 8) || 'Unknown';
}

export default function ActivityDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    resourceType: '',
  });
  const [activeView, setActiveView] = useState<'overview' | 'logs' | 'deletes'>('overview');

  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/audit-logs/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '30' });
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.action) params.set('action', filters.action);
      if (filters.resourceType) params.set('resourceType', filters.resourceType);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setLogsLoading(false);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-brand"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Team Activity</h1>
          <p className="portal-subtitle">Monitor admin actions, track accountability, and protect data</p>
        </div>
        <button
          onClick={() => { fetchStats(); fetchLogs(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Last 24 hours" value={stats.totals.last24h} icon={Clock} />
          <StatCard label="Last 7 days" value={stats.totals.last7d} icon={Activity} />
          <StatCard label="Last 30 days" value={stats.totals.last30d} icon={Users} />
          <StatCard label="All time" value={stats.totals.allTime} icon={Shield} color="purple" />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
        {(['overview', 'logs', 'deletes'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeView === view
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {view === 'overview' && 'Overview'}
            {view === 'logs' && 'All Activity'}
            {view === 'deletes' && (
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Deletions
                {stats && stats.recentDeletes.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">
                    {stats.recentDeletes.length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview View */}
      {activeView === 'overview' && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Activity */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Team Members (30 days)</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {stats.userActivity.map((user) => (
                <div key={user.userId} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand text-xs font-bold shrink-0 overflow-hidden">
                    {user.userAvatar ? (
                      <img src={user.userAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (user.userName || 'U').substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.userName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.userRole?.replace(/_/g, ' ')}
                      {user.lastActivity && (
                        <span className="text-gray-400"> · Last active: {formatFullDateTime(user.lastActivity)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {user.creates > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        +{user.creates}
                      </span>
                    )}
                    {user.updates > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        ✎{user.updates}
                      </span>
                    )}
                    {user.deletes > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                        −{user.deletes}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-1">{user.totalActions}</span>
                  </div>
                </div>
              ))}
              {stats.userActivity.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-500">No activity recorded yet</div>
              )}
            </div>
          </div>

          {/* Resource Breakdown */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Activity by Section (30 days)</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {stats.resourceActivity.map((item) => {
                const Icon = RESOURCE_ICONS[item.resourceType] || FileText;
                return (
                  <div key={item.resourceType} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.resourceType.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span className="text-green-600 dark:text-green-400">+{item.creates}</span>
                      <span className="text-blue-600 dark:text-blue-400">✎{item.updates}</span>
                      <span className="text-red-600 dark:text-red-400">−{item.deletes}</span>
                      <span className="text-gray-400 font-semibold ml-1">{item.total}</span>
                    </div>
                  </div>
                );
              })}
              {stats.resourceActivity.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-500">No activity recorded yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All Logs View */}
      {activeView === 'logs' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Filters */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filters.action}
              onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1); }}
              className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="APPROVE">Approve</option>
              <option value="PUBLISH">Publish</option>
              <option value="FEATURE">Feature</option>
            </select>
            <select
              value={filters.resourceType}
              onChange={(e) => { setFilters({ ...filters, resourceType: e.target.value }); setPage(1); }}
              className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="">All Resources</option>
              <option value="STARTUP">Startups</option>
              <option value="AI_TOOL">AI Tools</option>
              <option value="ARTICLE">Articles</option>
              <option value="EVENT">Events</option>
              <option value="NEWSLETTER">Newsletters</option>
              <option value="USER">Users</option>
            </select>
            {stats && (
              <select
                value={filters.userId}
                onChange={(e) => { setFilters({ ...filters, userId: e.target.value }); setPage(1); }}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <option value="">All Users</option>
                {stats.userActivity.map((u) => (
                  <option key={u.userId} value={u.userId}>{u.userName}</option>
                ))}
              </select>
            )}
          </div>

          {/* Log List */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {logsLoading ? (
              <div className="px-5 py-8 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-brand mx-auto"></div>
              </div>
            ) : logs.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-500">
                No activity logs found. Actions will be logged as team members use the admin panel.
              </div>
            ) : (
              logs.map((log) => <LogEntry key={log.id} log={log} />)
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deletes View */}
      {activeView === 'deletes' && stats && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-900/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 dark:border-red-900/20 bg-red-50/50 dark:bg-red-900/10">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4.5 h-4.5 text-red-600 dark:text-red-400" />
              <h2 className="text-base font-semibold text-red-900 dark:text-red-300">Recent Deletions</h2>
            </div>
            <p className="text-xs text-red-700/70 dark:text-red-400/70 mt-1">
              All delete operations by admin team members. Only Super Admins can delete records.
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {stats.recentDeletes.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Shield className="w-10 h-10 text-green-300 dark:text-green-700 mx-auto mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-400">No deletions recorded</p>
              </div>
            ) : (
              stats.recentDeletes.map((log) => <LogEntry key={log.id} log={log} showDetails />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LogEntry({ log, showDetails = false }: { log: AuditLog; showDetails?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const ActionIcon = ACTION_ICONS[log.action] || Activity;
  const ResourceIcon = RESOURCE_ICONS[log.resourceType] || FileText;
  const colorClass = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700';

  return (
    <div className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
      <div className="flex items-center gap-3">
        {/* Action badge */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
          <ActionIcon className="w-3.5 h-3.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 dark:text-white">
            <span className="font-medium">{log.userName || 'Unknown'}</span>
            <span className="text-gray-500 dark:text-gray-400">
              {' '}{log.action.toLowerCase()}d{' '}
            </span>
            <span className="font-medium">{log.resourceType.replace(/_/g, ' ').toLowerCase()}</span>
            {(log.after?.name || log.before?.name || log.after?.title || log.before?.title) && (
              <span className="text-gray-500 dark:text-gray-400">
                {' '}"{getResourceName(log)}"
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {log.userRole?.replace(/_/g, ' ')} · {formatFullDateTime(log.createdAt)} <span className="text-gray-300 dark:text-gray-600">({formatRelativeTime(log.createdAt)})</span>
          </p>
        </div>

        {/* Expand button for details */}
        {(log.before || log.after) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 ml-10 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-mono overflow-x-auto">
          {log.before && (
            <div className="mb-2">
              <span className="text-red-600 dark:text-red-400 font-sans font-semibold">Before:</span>
              <pre className="text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap break-all">
                {JSON.stringify(log.before, null, 2)}
              </pre>
            </div>
          )}
          {log.after && (
            <div>
              <span className="text-green-600 dark:text-green-400 font-sans font-semibold">After:</span>
              <pre className="text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap break-all">
                {JSON.stringify(log.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = 'brand' }: { label: string; value: number; icon: any; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/20' : 'bg-brand/10'
        }`}>
          <Icon className={`w-4.5 h-4.5 ${
            color === 'purple' ? 'text-purple-600 dark:text-purple-400' : 'text-brand'
          }`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

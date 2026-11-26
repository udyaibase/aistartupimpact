'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { notify } from '@/components/Toast';

interface ConsentLog {
  id: number;
  consent_id: string;
  timestamp: string;
  categories: {
    necessary: boolean;
    analytics: boolean;
    marketing: boolean;
  };
  method: string;
  policy_version: string;
  schema_version: string;
  ip_hash: string;
  user_agent: string;
  country: string | null;
  created_at: string;
}

interface ConsentStats {
  total: number;
  acceptedAll: number;
  rejectedAll: number;
  customized: number;
  analyticsAccepted: number;
  marketingAccepted: number;
  byMethod: {
    banner: number;
    preferences: number;
    link: number;
  };
}

type Decision = 'accepted' | 'rejected' | 'customized';
type Filter = 'all' | Decision;
type DateRange = 'today' | 'week' | 'month' | 'all';

const DECISION_LABEL: Record<Decision, string> = { accepted: 'Accepted all', rejected: 'Required only', customized: 'Customized' };
const DECISION_PILL: Record<Decision, string> = {
  accepted: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  // Choosing required cookies only is a normal answer, not a failure: neutral, not red.
  rejected: 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
  customized: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
};
const DECISION_BAR: Record<Decision, string> = { accepted: 'bg-green-600', rejected: 'bg-gray-400 dark:bg-gray-500', customized: 'bg-blue-600' };
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All decisions' }, { value: 'accepted', label: 'Accepted all' }, { value: 'rejected', label: 'Required only' }, { value: 'customized', label: 'Customized' },
];
const RANGES: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' },
];
const METHOD_LABEL: Record<string, string> = { banner: 'Cookie banner', preferences: 'Preferences panel', link: 'Footer link' };

const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl';
const count = (n: number) => (Number(n) || 0).toLocaleString('en-IN');
const pct = (part: number, total: number) => (total > 0 ? Math.round(((Number(part) || 0) / total) * 100) : 0);

/**
 * The API sums in SQL, and a sum over no rows comes back empty (null), or as text for big numbers. Every figure is
 * made a plain number here, so a quiet period shows 0 instead of breaking the page.
 */
function cleanStats(raw: unknown): ConsentStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<Record<keyof ConsentStats, unknown>>;
  const m = (s.byMethod ?? {}) as Partial<Record<keyof ConsentStats['byMethod'], unknown>>;
  const n = (v: unknown) => Number(v) || 0;
  return {
    total: n(s.total), acceptedAll: n(s.acceptedAll), rejectedAll: n(s.rejectedAll), customized: n(s.customized),
    analyticsAccepted: n(s.analyticsAccepted), marketingAccepted: n(s.marketingAccepted),
    byMethod: { banner: n(m.banner), preferences: n(m.preferences), link: n(m.link) },
  };
}

function decisionOf(log: ConsentLog): Decision {
  const { analytics, marketing } = log.categories ?? { analytics: false, marketing: false };
  if (analytics && marketing) return 'accepted';
  if (!analytics && !marketing) return 'rejected';
  return 'customized';
}

/** Segmented choice: one option is always on. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${value === o.value ? 'bg-white dark:bg-gray-950 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One labelled share: "Analytics 62% · 1,240 of 2,000" over a thin bar. */
function Share({ label, part, total, tone }: { label: string; part: number; total: number; tone: string }) {
  const p = pct(part, total);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="tabular-nums text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-white">{p}%</span> · {count(part)}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

const csvCell = (v: string | number | boolean | null) => {
  const s = String(v ?? '');
  // Browser names contain commas, and a leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export default function ConsentLogsClient() {
  const [logs, setLogs] = useState<ConsentLog[]>([]);
  const [stats, setStats] = useState<ConsentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const fetchConsentLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('filter', filter);
      if (dateRange !== 'all') params.append('dateRange', dateRange);

      const response = await fetch(`/api/admin/consent-logs?${params}`);
      if (!response.ok) throw new Error();
      const data = await response.json();

      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setStats(cleanStats(data.stats));
    } catch {
      notify("Couldn't load consent logs. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, dateRange]);

  useEffect(() => { fetchConsentLogs(); }, [fetchConsentLogs]);

  const exportToCSV = () => {
    const headers = ['ID', 'Consent ID', 'Timestamp', 'Necessary', 'Analytics', 'Marketing', 'Method', 'Policy Version', 'IP Hash', 'User Agent', 'Country'];
    const rows = logs.map((log) => [
      log.id, log.consent_id, log.timestamp, log.categories?.necessary ?? true, log.categories?.analytics ?? false, log.categories?.marketing ?? false,
      log.method, log.policy_version, log.ip_hash, log.user_agent, log.country || 'N/A',
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `consent-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const columns = useMemo<Column<ConsentLog>[]>(() => [
    {
      key: 'time', header: 'Time', sortValue: (l) => new Date(l.timestamp),
      cell: (l) => <span className="whitespace-nowrap">{new Date(l.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>,
    },
    {
      key: 'decision', header: 'Decision', sortValue: (l) => decisionOf(l),
      cell: (l) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${DECISION_PILL[decisionOf(l)]}`}>{DECISION_LABEL[decisionOf(l)]}</span>,
    },
    {
      key: 'categories', header: 'Allowed',
      cell: (l) => {
        const allowed = [l.categories?.analytics && 'Analytics', l.categories?.marketing && 'Marketing'].filter(Boolean);
        return <span className="whitespace-nowrap">{allowed.length ? allowed.join(', ') : 'Required only'}</span>;
      },
    },
    { key: 'method', header: 'Chosen in', sortValue: (l) => l.method, searchValue: (l) => l.method ?? '', cell: (l) => <span className="whitespace-nowrap">{METHOD_LABEL[l.method] ?? l.method}</span> },
    { key: 'policy', header: 'Policy version', sortValue: (l) => l.policy_version, searchValue: (l) => l.policy_version ?? '', cell: (l) => l.policy_version },
    { key: 'country', header: 'Country', sortValue: (l) => l.country, searchValue: (l) => l.country ?? '', cell: (l) => l.country || '–' },
    {
      key: 'ip', header: 'IP hash', searchValue: (l) => `${l.ip_hash ?? ''} ${l.consent_id ?? ''}`,
      cell: (l) => l.ip_hash ? <span className="text-xs font-mono text-gray-600 dark:text-gray-400" title={l.ip_hash}>{l.ip_hash.substring(0, 16)}…</span> : '–',
    },
  ], []);

  const tableFilters = useMemo<TableFilter<ConsentLog>[]>(() => [
    { key: 'method', label: 'Chosen in', options: [...new Set(logs.map((l) => l.method))].sort().map((m) => ({ value: m, label: METHOD_LABEL[m] ?? m })), matches: (l, v) => l.method === v },
    { key: 'policy', label: 'Policy version', options: [...new Set(logs.map((l) => l.policy_version))].sort().reverse().map((v) => ({ value: v, label: v })), matches: (l, v) => l.policy_version === v },
  ], [logs]);

  const rangeLabel = RANGES.find((r) => r.value === dateRange)!.label.toLowerCase();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="portal-title">Cookie consent logs</h1>
          <p className="portal-subtitle">What visitors chose in the cookie banner, kept as the record of consent.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={fetchConsentLogs} disabled={loading} className="btn-outline text-sm gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Refresh
          </button>
          <button type="button" onClick={exportToCSV} disabled={logs.length === 0} className="btn-brand text-sm gap-2 disabled:opacity-50">
            <Download className="w-4 h-4" aria-hidden /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Choice label="Period" value={dateRange} options={RANGES} onChange={setDateRange} />
        <Choice label="Decision" value={filter} options={FILTERS} onChange={setFilter} />
      </div>

      {stats && (
        <>
          <section aria-labelledby="consent-decisions" className={`${card} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="consent-decisions" className="portal-section-title">Decisions, {rangeLabel}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400"><span className="text-2xl font-semibold text-gray-900 dark:text-white tabular-nums">{count(stats.total)}</span> recorded</p>
            </div>

            {/* One bar, three parts: how every recorded decision splits. */}
            <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800" aria-hidden>
              {(['accepted', 'customized', 'rejected'] as Decision[]).map((d) => {
                const n = d === 'accepted' ? stats.acceptedAll : d === 'rejected' ? stats.rejectedAll : stats.customized;
                return n > 0 ? <div key={d} className={DECISION_BAR[d]} style={{ width: `${(n / Math.max(1, stats.total)) * 100}%` }} /> : null;
              })}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {([['accepted', stats.acceptedAll], ['customized', stats.customized], ['rejected', stats.rejectedAll]] as [Decision, number][]).map(([d, n]) => (
                <div key={d}>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <span aria-hidden className={`w-2.5 h-2.5 rounded-sm ${DECISION_BAR[d]}`} /> {DECISION_LABEL[d]}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-white tabular-nums">
                    {pct(n, stats.total)}% <span className="text-sm font-normal text-gray-600 dark:text-gray-400">· {count(n)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section aria-labelledby="consent-categories" className={`${card} p-4 sm:p-5 space-y-4`}>
              <h2 id="consent-categories" className="portal-section-title">What visitors allowed</h2>
              <Share label="Analytics cookies" part={stats.analyticsAccepted} total={stats.total} tone="bg-gray-900 dark:bg-gray-100" />
              <Share label="Marketing cookies" part={stats.marketingAccepted} total={stats.total} tone="bg-gray-900 dark:bg-gray-100" />
              <p className="text-xs text-gray-600 dark:text-gray-400">Required cookies are always on and need no consent.</p>
            </section>

            <section aria-labelledby="consent-methods" className={`${card} p-4 sm:p-5 space-y-4`}>
              <h2 id="consent-methods" className="portal-section-title">Where the choice was made</h2>
              <Share label="Cookie banner" part={stats.byMethod.banner} total={stats.total} tone="bg-gray-500" />
              <Share label="Preferences panel" part={stats.byMethod.preferences} total={stats.total} tone="bg-gray-500" />
              <Share label="Footer link" part={stats.byMethod.link} total={stats.total} tone="bg-gray-500" />
            </section>
          </div>
        </>
      )}

      <section aria-labelledby="consent-records" className="space-y-3">
        <div>
          <h2 id="consent-records" className="portal-section-title">Records</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">The newest 500 for the period and decision chosen above. The figures above count every record.</p>
        </div>
        <DataTable
          tableId="consent-logs"
          noun="consent records"
          rows={logs}
          rowKey={(l) => String(l.id)}
          columns={columns}
          filters={tableFilters}
          loading={loading}
          pageSize={25}
          searchPlaceholder="Search country, policy version, IP hash or consent ID"
          empty={{ title: 'No consent records for this period', description: 'Records appear as visitors answer the cookie banner.' }}
        />
      </section>
    </div>
  );
}

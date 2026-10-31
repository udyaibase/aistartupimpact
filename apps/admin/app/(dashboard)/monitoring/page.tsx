'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { monitoringAction } from './actions';

type Data = Extract<Awaited<ReturnType<typeof monitoringAction>>, { success: true }>;

const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl';
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never');
const usd = (n: number) => `$${n.toFixed(2)}`;
const FEATURE: Record<string, string> = { ai_screening: 'AI candidate review', job_parse: 'Job description import', resume_prefill: 'Resume autofill', careers_scraper: 'Careers page import (admin)' };

function Meter({ label, used, limit, fmt = String }: { label: string; used: number; limit: number; fmt?: (n: number) => string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const tone = pct >= 100 ? 'bg-red-600' : pct >= 80 ? 'bg-amber-500' : 'bg-green-600';
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-gray-600 dark:text-gray-400">{label}</span><span className="font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(used)} / {fmt(limit)}</span></div>
      <div className="mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await monitoringAction();
    setLoading(false);
    if (r.success) setData(r); else setError(r.error ?? 'Failed to load');
  };
  useEffect(() => { load(); }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />;
  const { jobs, email, ai, alerts } = data;

  return (
    <div className="space-y-5 font-jakarta">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Activity className="w-5 h-5 text-brand" /> Monitoring</h1>
          <p className="text-xs text-gray-500 mt-0.5">Scheduled jobs, email sending limits and OpenAI spend. Problems are emailed to ADMIN_DIGEST_EMAIL (at most once every few hours per issue).</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      <section className={card} aria-labelledby="jobs-title">
        <h2 id="jobs-title" className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-900 dark:text-white">Scheduled jobs</h2>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {jobs.map((j) => {
            const bad = j.lastOk === false || j.overdue;
            return (
              <li key={j.job} className="px-4 py-3 flex items-start gap-3">
                {j.lastRunAt == null ? <Activity className="w-4 h-4 mt-0.5 text-gray-400" /> : bad ? <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{j.label}</p>
                  <p className="text-xs text-gray-500">
                    {j.lastRunAt == null ? 'No runs recorded yet (recording starts with the next run).' : <>Last run {when(j.lastRunAt)} · {j.lastOk ? 'succeeded' : 'failed'} · last success {when(j.lastSuccessAt)}{j.failed7d ? ` · ${j.failed7d} failure${j.failed7d === 1 ? '' : 's'} this week` : ''}</>}
                  </p>
                  {j.overdue && <p className="text-xs font-semibold text-amber-700 mt-0.5">Overdue: check Vercel → Cron Jobs and CRON_SECRET.</p>}
                  {j.lastError && <p className="text-xs text-red-600 mt-0.5 break-words">{j.lastError}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className={`${card} p-4 space-y-3`} aria-labelledby="email-title">
          <h2 id="email-title" className="text-sm font-semibold text-gray-900 dark:text-white">Email (Resend)</h2>
          <Meter label="Last 24 hours" used={email.sent24h} limit={email.limits.daily} />
          <Meter label="This month" used={email.sentMonth} limit={email.limits.monthly} />
          <p className={`text-xs ${email.failed24h ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>{email.failed24h} failed in the last 24 hours</p>
          <p className="text-xs text-gray-500">Limits come from RESEND_DAILY_LIMIT / RESEND_MONTHLY_LIMIT (defaults are the free plan: 100 a day, 3,000 a month).</p>
        </section>

        <section className={`${card} p-4 space-y-3`} aria-labelledby="ai-title">
          <h2 id="ai-title" className="text-sm font-semibold text-gray-900 dark:text-white">OpenAI (estimated)</h2>
          <Meter label="Today" used={ai.today} limit={ai.budgets.dailyUsd} fmt={usd} />
          <Meter label="This month" used={ai.month} limit={ai.budgets.monthlyUsd} fmt={usd} />
          <p className={`text-xs ${ai.failed24h ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>{ai.calls24h} calls in 24 hours, {ai.failed24h} failed · Hard stop {ai.hardStop ? 'on (AI pauses at the budget)' : 'off'}</p>
          {ai.byFeature.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-left"><tr><th className="font-semibold py-1">This month by feature</th><th className="font-semibold text-right">Calls</th><th className="font-semibold text-right">Cost</th></tr></thead>
              <tbody>{ai.byFeature.map((f) => <tr key={f.feature}><td className="py-0.5">{FEATURE[f.feature] ?? f.feature}</td><td className="text-right tabular-nums">{f.calls}</td><td className="text-right tabular-nums">{usd(f.usd)}</td></tr>)}</tbody>
            </table>
          )}
          {ai.recentFailures.length > 0 && (
            <ul className="text-xs text-red-600 space-y-0.5">{ai.recentFailures.map((f, i) => <li key={i}>{when(f.createdAt)} · {FEATURE[f.feature] ?? f.feature}: {f.error}</li>)}</ul>
          )}
        </section>
      </div>

      <section className={card} aria-labelledby="alerts-title">
        <h2 id="alerts-title" className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-900 dark:text-white">Recent alerts</h2>
        {alerts.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-500">No alerts so far.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {alerts.map((a) => <li key={a.key} className="px-4 py-2 text-xs flex justify-between gap-3"><span className="font-mono text-gray-700 dark:text-gray-300">{a.key}</span><span className="text-gray-500 whitespace-nowrap">{when(a.lastSentAt)} · {a.count}×</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

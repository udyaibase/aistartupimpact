import Link from 'next/link';
import { Clock, Users } from 'lucide-react';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { loadInsights, type Insights } from '@/lib/employer/insights';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Insights' };

const RANGES = [30, 90] as const;
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
const BAR = 'bg-[#A50F15] dark:bg-red-400';

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`);
function hours(h: number | null) {
  if (h == null) return '—';
  if (h < 1) return '< 1 hour';
  if (h < 48) return `${Math.round(h)} hours`;
  return `${Math.round(h / 24)} days`;
}
const STATUS: Record<string, string> = { OPEN: 'Open', PAUSED: 'Paused', CLOSED: 'Closed', DRAFT: 'Draft', REVIEW: 'Under review' };

export default async function InsightsPage(props: { searchParams: Promise<{ range?: string }> }) {
  const session = await requirePagePermission('insights.view');
  const sp = await props.searchParams;
  const days = sp.range === '90' ? 90 : 30;
  const d = await loadInsights(session.id, days);
  const change = d.previous ? (d.applications - d.previous) / d.previous : null;

  return (
    <div className="font-jakarta space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="portal-title">Insights</h1>
          <p className="portal-subtitle">Where candidates come from, how far they get, and how fast your team replies.</p>
        </div>
        <nav aria-label="Time range" className="inline-flex p-1 rounded-[12px] bg-gray-100 dark:bg-gray-800">
          {RANGES.map((r) => (
            <Link key={r} href={`/employer/analytics?range=${r}`} aria-current={days === r ? 'page' : undefined}
              className={`min-h-[36px] px-3 inline-flex items-center rounded-[9px] text-sm font-semibold ${days === r ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}>
              Last {r} days
            </Link>
          ))}
        </nav>
      </div>

      {d.waitingOver5Days > 0 && (
        <Link href="/employer/applications?stage=new" className="flex items-center gap-3 px-4 py-3 rounded-[12px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 text-sm text-amber-900 dark:text-amber-200 hover:underline">
          <Clock className="w-4 h-4 shrink-0" aria-hidden />
          {d.waitingOver5Days} candidate{d.waitingOver5Days === 1 ? ' has' : 's have'} been waiting more than 5 days for a reply. Review now
        </Link>
      )}

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Applications" value={d.applications.toLocaleString('en-IN')}
          note={change == null ? `last ${days} days` : `${change >= 0 ? '+' : ''}${Math.round(change * 100)}% vs previous ${days} days`} />
        <Stat label="Median first reply" value={hours(d.medianResponseHours)} note="from applying to your first move" />
        <Stat label="Replied within 2 days" value={pct(d.repliedWithin2Days)} note="candidates expect a reply fast" />
        <Stat label="Hires" value={String(d.hires)} note={`from applications in the last ${days} days`} />
      </dl>

      {d.applications === 0 ? (
        <div className={`${card} px-4 py-12 text-center`}>
          <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" aria-hidden />
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No applications in the last {days} days</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Share your open roles or add the widget to your website to start seeing numbers here.</p>
        </div>
      ) : (
        <>
          <DailyChart d={d} />
          <div className="grid gap-4 lg:grid-cols-2">
            <BarList title="Where candidates come from" rows={d.bySource.map((s) => ({ label: s.label, count: s.count }))} total={d.applications} />
            <BarList title="How far candidates get" rows={d.funnel.map((f) => ({ label: f.label, count: f.count }))} total={d.funnel[0].count}
              foot="Each stage counts everyone who reached it, even if they were rejected later." />
          </div>
        </>
      )}

      <section aria-labelledby="jobs-h" className={`${card} overflow-x-auto`}>
        <h2 id="jobs-h" className="portal-section-title px-4 sm:px-5 pt-4 pb-2">By job</h2>
        {d.perJob.length === 0 ? <p className="px-4 sm:px-5 pb-4 text-sm text-gray-600 dark:text-gray-400">No jobs in this period.</p> : (
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
                {['Job', 'Status', 'Views', 'Applications', 'Apply rate', 'Waiting', 'Median first reply'].map((h, i) => (
                  <th key={h} scope="col" className={`px-4 sm:px-5 py-2 font-semibold ${i >= 2 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {d.perJob.map((j) => (
                <tr key={j.id}>
                  <th scope="row" className="px-4 sm:px-5 py-2.5 text-left font-semibold">
                    <Link href={`/employer/applications?job=${j.id}`} className="text-gray-900 dark:text-white hover:text-[#A50F15]">{j.title}</Link>
                  </th>
                  <td className="px-4 sm:px-5 py-2.5 text-gray-600 dark:text-gray-400">{STATUS[j.status] ?? j.status}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums">{j.views.toLocaleString('en-IN')}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums">{j.total.toLocaleString('en-IN')}{j.inRange !== j.total && <span className="text-gray-500"> ({j.inRange} new)</span>}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums">{pct(j.applyRate)}</td>
                  <td className={`px-4 sm:px-5 py-2.5 text-right tabular-nums ${j.waiting ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500'}`}>{j.waiting}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right">{hours(j.medianResponseHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${card} p-4`}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums">{value}</dd>
      <dd className="text-xs text-gray-500 mt-0.5">{note}</dd>
    </div>
  );
}

function BarList({ title, rows, total, foot }: { title: string; rows: { label: string; count: number }[]; total: number; foot?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section aria-label={title} className={`${card} p-4 sm:p-5`}>
      <h2 className="portal-section-title mb-3">{title}</h2>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} title={`${r.label}: ${r.count} (${total ? Math.round((r.count / total) * 100) : 0}%)`}>
            <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
              <span className="text-gray-800 dark:text-gray-200">{r.label}</span>
              <span className="tabular-nums text-gray-900 dark:text-white font-semibold">{r.count}<span className="font-normal text-gray-500"> · {total ? Math.round((r.count / total) * 100) : 0}%</span></span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
              <div className={`h-full rounded-full ${BAR}`} style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count ? 4 : 0 }} />
            </div>
          </li>
        ))}
      </ul>
      {foot && <p className="mt-3 text-xs text-gray-500">{foot}</p>}
    </section>
  );
}

function DailyChart({ d }: { d: Insights }) {
  const max = Math.max(1, ...d.daily.map((x) => x.count));
  const fmt = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const peak = d.daily.reduce((a, b) => (b.count > a.count ? b : a), d.daily[0]);
  return (
    <section aria-labelledby="daily-h" className={`${card} p-4 sm:p-5`}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 id="daily-h" className="portal-section-title">Applications per day</h2>
        <span className="text-xs text-gray-500">Busiest: {fmt(peak.day)} · {peak.count}</span>
      </div>
      <div className="relative h-36 flex items-end gap-[2px] border-b border-gray-200 dark:border-gray-800" role="img"
        aria-label={`Applications per day over the last ${d.days} days. Total ${d.applications}, busiest day ${fmt(peak.day)} with ${peak.count}.`}>
        <span className="absolute -top-1 left-0 text-[11px] text-gray-500 tabular-nums" aria-hidden>{max}</span>
        {d.daily.map((x) => (
          <div key={x.day} className="group relative flex-1 h-full flex items-end" title={`${fmt(x.day)}: ${x.count}`}>
            <div className={`w-full rounded-t-[4px] ${x.count ? BAR : ''} group-hover:opacity-80`} style={{ height: x.count ? `${Math.max(3, (x.count / max) * 100)}%` : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-gray-500" aria-hidden>
        <span>{fmt(d.daily[0].day)}</span><span>Today</span>
      </div>
    </section>
  );
}

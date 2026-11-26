import Link from 'next/link';
import type { MonthPoint } from '@/lib/billing/summary';
import { STREAM_LABEL, type RevenueStream } from '@/lib/billing/types';
import { rupees, rupeesShort } from './format';

/** Presentational pieces shared by the billing pages. No data loading, no browser code. */
export const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl';

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

export function Panel({ title, action, children, id }: { title: string; action?: { href: string; label: string }; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className={card}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 id={id} className="portal-section-title">{title}</h2>
        {action && <Link href={action.href} className="text-sm font-semibold text-brand hover:underline shrink-0">{action.label}</Link>}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

/** Fixed colour per stream, the same on every chart. Kept apart from the black primary so stacks stay readable. */
export const STREAM_COLOR: Record<RevenueStream, string> = {
  EMPLOYER: '#4f5fd6', HOST: '#0d9488', TICKETS: '#d97706', FUNDING: '#7c3aed', ADS: '#db2777',
};

/**
 * Net revenue per month as stacked bars. The same numbers follow as a table for screen readers and for anyone who
 * wants exact figures (the bars carry only a short label).
 */
export function MonthlyBars({ points, streams }: { points: MonthPoint[]; streams: RevenueStream[] }) {
  const max = Math.max(1, ...points.map((p) => p.total));
  return (
    <div className="relative">
      {streams.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3" aria-hidden>
          {streams.map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STREAM_COLOR[s] }} /> {STREAM_LABEL[s]}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5 sm:gap-2 h-44" aria-hidden>
        {points.map((p) => (
          <div key={p.key} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" title={`${p.label}: ${rupees(p.total)}`}>
            <span className="text-[11px] text-gray-600 dark:text-gray-400 tabular-nums truncate max-w-full">{p.total > 0 ? rupeesShort(p.total) : ''}</span>
            <div className="w-full max-w-[44px] flex flex-col-reverse rounded-t overflow-hidden bg-gray-100 dark:bg-gray-800" style={{ height: `${Math.max(2, (p.total / max) * 82)}%` }}>
              {streams.map((s) => {
                const v = p.byStream[s] ?? 0;
                return v > 0 ? <div key={s} style={{ height: `${(v / p.total) * 100}%`, background: STREAM_COLOR[s] }} /> : null;
              })}
            </div>
            <span className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-nowrap">{p.label}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Net revenue per month, before GST</caption>
        <thead><tr><th>Month</th>{streams.map((s) => <th key={s}>{STREAM_LABEL[s]}</th>)}<th>Total</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}><th>{p.label}</th>{streams.map((s) => <td key={s}>{rupees(p.byStream[s] ?? 0)}</td>)}<td>{rupees(p.total)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A small two-or-three column table of labelled amounts. */
export function Breakdown({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-600 dark:text-gray-400">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-600 dark:text-gray-400">
          {head.map((h, i) => <th key={h} className={`py-1.5 font-medium ${i === 0 ? '' : 'text-right'}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((r, n) => (
          <tr key={n}>
            {r.map((c, i) => <td key={i} className={`py-2 ${i === 0 ? 'text-gray-900 dark:text-white' : 'text-right tabular-nums text-gray-800 dark:text-gray-200'}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

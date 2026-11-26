import { fyStart, lastMonths, monthKey, monthStart } from './periods';
import type { Cycle, LedgerRow, RevenueStream, Stream } from './types';

/**
 * Turns ledger rows into the numbers the billing pages show. Pure: give it rows and "now", get totals back.
 * Revenue is always net of refunds and before GST, counted on the day the payment was received.
 */
const paid = (r: LedgerRow) => r.state !== 'FAILED' && !!r.paidAt;
const sum = (rows: LedgerRow[], pick: (r: LedgerRow) => number) => rows.reduce((n, r) => n + pick(r), 0);

export interface PeriodTotals { thisMonth: number; lastMonth: number; fy: number; allTime: number }

export function periodTotals(rows: LedgerRow[], now: Date): PeriodTotals {
  const m0 = monthStart(now).getTime(), m1 = monthStart(now, 1).getTime(), fy = fyStart(now).getTime();
  const t: PeriodTotals = { thisMonth: 0, lastMonth: 0, fy: 0, allTime: 0 };
  for (const r of rows) {
    if (!paid(r)) continue;
    const at = new Date(r.paidAt!).getTime();
    t.allTime += r.netPaise;
    if (at >= fy) t.fy += r.netPaise;
    if (at >= m0) t.thisMonth += r.netPaise;
    else if (at >= m1) t.lastMonth += r.netPaise;
  }
  return t;
}

/** Same four periods for a stream that only has monthly sums (ticket fees). */
export function periodTotalsFromMonths(byMonth: Record<string, number>, now: Date): PeriodTotals {
  const thisKey = monthKey(now), lastKey = monthKey(monthStart(now, 1)), fyKey = monthKey(fyStart(now));
  const t: PeriodTotals = { thisMonth: byMonth[thisKey] ?? 0, lastMonth: byMonth[lastKey] ?? 0, fy: 0, allTime: 0 };
  for (const [key, value] of Object.entries(byMonth)) {
    t.allTime += value;
    if (key >= fyKey) t.fy += value;
  }
  return t;
}

export interface MonthPoint { key: string; label: string; total: number; byStream: Partial<Record<RevenueStream, number>> }

/** Net revenue per month for the last `months` months, split by stream. `extra` adds streams that come as monthly sums. */
export function monthlySeries(rows: LedgerRow[], now: Date, months = 12, extra: Partial<Record<RevenueStream, Record<string, number>>> = {}): MonthPoint[] {
  const points: MonthPoint[] = lastMonths(now, months).map((m) => ({ ...m, total: 0, byStream: {} }));
  const at = new Map(points.map((p) => [p.key, p]));
  const add = (key: string, stream: RevenueStream, value: number) => {
    const p = at.get(key);
    if (!p || !value) return;
    p.byStream[stream] = (p.byStream[stream] ?? 0) + value;
    p.total += value;
  };
  for (const r of rows) if (paid(r)) add(monthKey(r.paidAt!), r.stream, r.netPaise);
  for (const [stream, byMonth] of Object.entries(extra)) for (const [key, value] of Object.entries(byMonth ?? {})) add(key, stream as RevenueStream, value);
  return points;
}

export interface CycleTotals { count: number; net: number; collected: number }

/** Billing by cycle (monthly plans, yearly plans, one-time purchases) for payments received on or after `since`. */
export function byCycle(rows: LedgerRow[], since: Date): Record<Cycle, CycleTotals> {
  const out: Record<Cycle, CycleTotals> = { MONTHLY: { count: 0, net: 0, collected: 0 }, ANNUAL: { count: 0, net: 0, collected: 0 }, ONE_TIME: { count: 0, net: 0, collected: 0 } };
  for (const r of rows) {
    if (!paid(r) || new Date(r.paidAt!) < since) continue;
    out[r.cycle].count += 1;
    out[r.cycle].net += r.netPaise;
    out[r.cycle].collected += r.totalPaise - (r.refundAmountPaise ?? 0);
  }
  return out;
}

export interface ProductTotals { code: string; product: string; count: number; net: number }

/** Net revenue per product for payments received on or after `since`, biggest first. */
export function byProduct(rows: LedgerRow[], since: Date): ProductTotals[] {
  const map = new Map<string, ProductTotals>();
  for (const r of rows) {
    if (!paid(r) || new Date(r.paidAt!) < since) continue;
    const key = `${r.stream}:${r.code}`;
    const t = map.get(key) ?? { code: r.code, product: r.product, count: 0, net: 0 };
    t.count += 1;
    t.net += r.netPaise;
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

export interface FailedRow extends LedgerRow {
  /** The same account paid for something in the same stream after this failure. */
  recovered: boolean;
}

/** Failed payments, newest first, marked "recovered" when that account went on to pay in the same stream. */
export function failedPayments(rows: LedgerRow[]): FailedRow[] {
  const laterPaid = new Map<string, number>();
  for (const r of rows) {
    if (!paid(r)) continue;
    const key = `${r.stream}:${r.accountId}`;
    laterPaid.set(key, Math.max(laterPaid.get(key) ?? 0, new Date(r.paidAt!).getTime()));
  }
  return rows
    .filter((r) => r.state === 'FAILED')
    .map((r) => ({ ...r, recovered: (laterPaid.get(`${r.stream}:${r.accountId}`) ?? 0) > new Date(r.failedAt ?? r.createdAt).getTime() }))
    .sort((a, b) => (b.failedAt ?? b.createdAt).localeCompare(a.failedAt ?? a.createdAt));
}

export const refundedPayments = (rows: LedgerRow[]) =>
  rows.filter((r) => !!r.refundedAt).sort((a, b) => b.refundedAt!.localeCompare(a.refundedAt!));

export interface HealthTotals {
  /** Customer money received (GST included) since `since`, before refunds. */
  collected: number;
  gst: number;
  refunds: number;
  refundCount: number;
  failedCount: number;
  failedValue: number;
  /** Failed value not followed by a successful payment from the same account. */
  failedOpenValue: number;
  paidCount: number;
}

export function health(rows: LedgerRow[], since: Date): HealthTotals {
  const inRange = (iso: string | null) => !!iso && new Date(iso) >= since;
  const paidRows = rows.filter((r) => paid(r) && inRange(r.paidAt));
  const refunds = rows.filter((r) => inRange(r.refundedAt));
  const failed = failedPayments(rows).filter((r) => inRange(r.failedAt ?? r.createdAt));
  return {
    collected: sum(paidRows, (r) => r.totalPaise),
    gst: sum(paidRows, (r) => r.gstPaise),
    paidCount: paidRows.length,
    refunds: sum(refunds, (r) => r.refundAmountPaise ?? 0),
    refundCount: refunds.length,
    failedCount: failed.length,
    failedValue: sum(failed, (r) => r.totalPaise),
    failedOpenValue: sum(failed.filter((r) => !r.recovered), (r) => r.totalPaise),
  };
}

/** Lifetime paid and most recent payment per account, for subscriber lists. */
export function accountHistory(rows: LedgerRow[], stream: Stream): Map<string, { lifetimeNet: number; payments: number; last: LedgerRow | null }> {
  const map = new Map<string, { lifetimeNet: number; payments: number; last: LedgerRow | null }>();
  for (const r of rows) {
    if (r.stream !== stream || !paid(r)) continue;
    const h = map.get(r.accountId) ?? { lifetimeNet: 0, payments: 0, last: null };
    h.lifetimeNet += r.netPaise;
    h.payments += 1;
    if (!h.last || r.paidAt! > h.last.paidAt!) h.last = r;
    map.set(r.accountId, h);
  }
  return map;
}

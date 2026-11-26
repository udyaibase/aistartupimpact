import { describe, expect, it } from 'vitest';
import { fyLabel, fyStart, lastMonths, monthKey, monthStart, netOfRefund } from '@/lib/billing/periods';
import { accountHistory, byCycle, byProduct, failedPayments, health, monthlySeries, periodTotals, periodTotalsFromMonths, refundedPayments } from '@/lib/billing/summary';
import type { LedgerRow } from '@/lib/billing/types';

// 26 Nov 2026, 10:00 IST
const NOW = new Date('2026-11-26T04:30:00Z');

let n = 0;
function row(over: Partial<LedgerRow>): LedgerRow {
  n += 1;
  const base: LedgerRow = {
    id: `p${n}`, stream: 'EMPLOYER', product: 'Employer plan · Pro', code: 'PRO', cycle: 'MONTHLY', accountId: 'acc1', account: 'Acme', email: 'a@acme.test',
    amountPaise: 100000, gstPaise: 18000, totalPaise: 118000, netPaise: 100000, state: 'PAID', online: true, foundingPrice: false,
    invoiceNumber: null, razorpayId: null, createdAt: '2026-11-10T06:00:00Z', paidAt: '2026-11-10T06:00:00Z', failedAt: null,
    periodStart: null, periodEnd: null, refundedAt: null, refundAmountPaise: null, refundReason: null, refundedBy: null, creditNoteNumber: null,
  };
  return { ...base, ...over };
}
const failed = (over: Partial<LedgerRow>) => row({ state: 'FAILED', netPaise: 0, paidAt: null, failedAt: over.createdAt ?? '2026-11-12T06:00:00Z', ...over });

describe('billing periods (India time, April financial year)', () => {
  it('puts a late-evening UTC payment in the next IST day and month', () => {
    expect(monthKey('2026-10-31T19:00:00Z')).toBe('2026-11'); // 00:30 IST on 1 Nov
    expect(monthKey('2026-10-31T18:00:00Z')).toBe('2026-10'); // 23:30 IST on 31 Oct
  });

  it('starts months and the financial year at IST midnight', () => {
    expect(monthStart(NOW).toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(monthStart(NOW, 1).toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(fyStart(NOW).toISOString()).toBe('2026-03-31T18:30:00.000Z');
    expect(fyLabel(NOW)).toBe('FY 2026-27');
    expect(fyLabel(new Date('2026-02-10T06:00:00Z'))).toBe('FY 2025-26');
  });

  it('lists the last months oldest first, ending with this month', () => {
    const months = lastMonths(NOW, 12);
    expect(months).toHaveLength(12);
    expect(months[0].key).toBe('2025-12');
    expect(months[11].key).toBe('2026-11');
  });

  it('takes a refund off revenue in proportion, GST excluded', () => {
    expect(netOfRefund(100000, 118000, null)).toBe(100000);
    expect(netOfRefund(100000, 118000, 118000)).toBe(0);
    expect(netOfRefund(100000, 118000, 59000)).toBe(50000);
    expect(netOfRefund(100000, 118000, 999999)).toBe(0); // never negative
  });
});

describe('billing summary', () => {
  const rows = [
    row({ paidAt: '2026-11-10T06:00:00Z' }),                                             // this month
    row({ paidAt: '2026-10-05T06:00:00Z', cycle: 'ANNUAL', amountPaise: 1000000, gstPaise: 180000, totalPaise: 1180000, netPaise: 1000000 }), // last month, yearly
    row({ paidAt: '2026-02-05T06:00:00Z' }),                                             // previous financial year
    row({ stream: 'HOST', code: 'BOOST', product: 'Event Boost', cycle: 'ONE_TIME', accountId: 'h1', paidAt: '2026-11-02T06:00:00Z', amountPaise: 50000, gstPaise: 9000, totalPaise: 59000, netPaise: 50000 }),
    row({ paidAt: '2026-11-03T06:00:00Z', state: 'PART_REFUNDED', netPaise: 50000, refundedAt: '2026-11-04T06:00:00Z', refundAmountPaise: 59000, refundReason: 'Charged twice' }),
    failed({ accountId: 'acc1', createdAt: '2026-11-01T06:00:00Z' }),                    // acc1 paid on 10 Nov → recovered
    failed({ accountId: 'acc9', createdAt: '2026-11-20T06:00:00Z' }),                    // never paid → open
  ];

  it('totals net revenue per period and ignores failed payments', () => {
    const t = periodTotals(rows, NOW);
    expect(t.thisMonth).toBe(100000 + 50000 + 50000);
    expect(t.lastMonth).toBe(1000000);
    expect(t.fy).toBe(100000 + 50000 + 50000 + 1000000);
    expect(t.allTime).toBe(t.fy + 100000);
  });

  it('totals a monthly-sum stream the same way', () => {
    const t = periodTotalsFromMonths({ '2026-11': 700, '2026-10': 300, '2026-04': 50, '2026-03': 9 }, NOW);
    expect(t).toEqual({ thisMonth: 700, lastMonth: 300, fy: 1050, allTime: 1059 });
  });

  it('builds the monthly series by stream, adding ticket fees', () => {
    const series = monthlySeries(rows, NOW, 12, { TICKETS: { '2026-11': 2500 } });
    const nov = series[11];
    expect(nov.key).toBe('2026-11');
    expect(nov.byStream.EMPLOYER).toBe(150000);
    expect(nov.byStream.HOST).toBe(50000);
    expect(nov.byStream.TICKETS).toBe(2500);
    expect(nov.total).toBe(202500);
    expect(series[10].total).toBe(1000000);
  });

  it('splits billing into monthly, yearly and one-time', () => {
    const c = byCycle(rows, fyStart(NOW));
    expect(c.MONTHLY.count).toBe(2);
    expect(c.ANNUAL).toMatchObject({ count: 1, net: 1000000 });
    expect(c.ONE_TIME).toMatchObject({ count: 1, net: 50000 });
    expect(c.MONTHLY.collected).toBe(118000 + 118000 - 59000); // what customers paid, less what went back
  });

  it('ranks products by net revenue', () => {
    const p = byProduct(rows, fyStart(NOW));
    expect(p[0]).toMatchObject({ code: 'PRO', count: 3, net: 1150000 });
    expect(p[1]).toMatchObject({ code: 'BOOST', count: 1, net: 50000 });
  });

  it('marks a failed payment recovered only when that account paid afterwards', () => {
    const f = failedPayments(rows);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ accountId: 'acc9', recovered: false }); // newest first
    expect(f[1]).toMatchObject({ accountId: 'acc1', recovered: true });
  });

  it('does not count a payment made before the failure as a recovery', () => {
    const f = failedPayments([row({ accountId: 'x', paidAt: '2026-11-01T06:00:00Z' }), failed({ accountId: 'x', createdAt: '2026-11-05T06:00:00Z' })]);
    expect(f[0].recovered).toBe(false);
  });

  it('lists refunds and sums payment health for a period', () => {
    expect(refundedPayments(rows)).toHaveLength(1);
    const h = health(rows, monthStart(NOW));
    expect(h.paidCount).toBe(3);
    expect(h.collected).toBe(118000 + 59000 + 118000);
    expect(h.gst).toBe(18000 + 9000 + 18000);
    expect(h).toMatchObject({ refundCount: 1, refunds: 59000, failedCount: 2, failedValue: 236000, failedOpenValue: 118000 });
  });

  it('keeps lifetime value and the latest payment per account', () => {
    const h = accountHistory(rows, 'EMPLOYER').get('acc1')!;
    expect(h.payments).toBe(4);
    expect(h.lifetimeNet).toBe(100000 + 1000000 + 100000 + 50000);
    expect(h.last?.paidAt).toBe('2026-11-10T06:00:00Z');
    expect(accountHistory(rows, 'EMPLOYER').has('h1')).toBe(false);
  });
});

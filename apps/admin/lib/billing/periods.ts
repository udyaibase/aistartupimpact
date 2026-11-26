/**
 * Dates and money rules for billing reports. Everything is counted in India time (IST), and the year is the Indian
 * financial year (1 April to 31 March). Pure functions: no database, safe to import anywhere.
 */
const IST_MS = 5.5 * 36e5;
const toIst = (d: Date) => new Date(d.getTime() + IST_MS);

/** "2026-11" for the IST month a moment falls in. */
export function monthKey(d: Date | string): string {
  const ist = toIst(new Date(d));
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** First moment (IST) of the month `back` months before `now`. */
export function monthStart(now: Date, back = 0): Date {
  const ist = toIst(now);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1) - IST_MS);
}

/** 1 April (IST) of the financial year `now` falls in. */
export function fyStart(now: Date): Date {
  const ist = toIst(now);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 3, 1) - IST_MS);
}

/** "FY 2026-27" for the financial year `now` falls in. */
export function fyLabel(now: Date): string {
  const y = toIst(fyStart(now)).getUTCFullYear();
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** The last `n` month keys ending with the current month, oldest first. */
export function lastMonths(now: Date, n: number): { key: string; label: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const start = monthStart(now, n - 1 - i);
    const ist = toIst(start);
    return { key: monthKey(start), label: ist.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }) };
  });
}

/**
 * Revenue a payment brought in: the pre-GST amount, less the same share of it that was refunded (a refund is of the
 * GST-inclusive total). Never negative.
 */
export function netOfRefund(amountPaise: number, totalPaise: number, refundAmountPaise: number | null | undefined): number {
  const refund = Math.min(refundAmountPaise ?? 0, totalPaise);
  return Math.max(0, amountPaise - Math.round((refund * amountPaise) / Math.max(1, totalPaise)));
}

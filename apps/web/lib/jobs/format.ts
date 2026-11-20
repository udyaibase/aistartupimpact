import { WORK_TYPES } from '@/lib/jobs/composer';
import type { CareersJob } from '@/lib/jobs/careers';

const label = (list: readonly { value: string; label: string }[], v: string | null) => (v ? list.find((x) => x.value === v)?.label : undefined);

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', SGD: 'S$', AED: 'AED ' };

/**
 * A yearly salary range, written one way everywhere a job is shown: "₹16–29 L" in lakh for INR, "$90K–120K" in
 * thousands for other currencies. A range with only one end shows that end ("₹18 L"), never "–0L". Null when there
 * is nothing to show (including a salary the employer hides: the queries send none).
 */
export function salaryText(j: { salaryMin?: number | null; salaryMax?: number | null; salaryCurrency?: string | null }): string | null {
  const min = Number(j.salaryMin) || 0;
  const max = Number(j.salaryMax) || 0;
  if (!min && !max) return null;
  const range = min && max && min !== max;
  const currency = j.salaryCurrency || 'INR';
  if (currency === 'INR') {
    const l = (n: number) => (n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 });
    return range ? `₹${l(min)}–${l(max)} L` : `₹${l(min || max)} L`;
  }
  const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const k = (n: number) => `${Math.round(n / 1000)}K`;
  return range ? `${sym}${k(min)}–${k(max)}` : `${sym}${k(min || max)}`;
}

export function placeText(j: Pick<CareersJob, 'workType' | 'city' | 'country' | 'location'>): string {
  if (j.workType === 'REMOTE') return j.country ? `Remote · ${j.country}` : 'Remote';
  return [j.city || j.location, label(WORK_TYPES, j.workType)].filter(Boolean).join(' · ');
}

/** "5 yrs", "1 yr", and "Under 1 yr" for someone who entered 0. */
export function yearsText(n: number): string {
  return n < 1 ? 'Under 1 yr' : n === 1 ? '1 yr' : `${n} yrs`;
}

/** A job's place and work mode on one line, without saying "Remote" twice ("Remote · India", not "Remote · India · Remote"). */
export function placeLine(location: string | null | undefined, workTypeLabel: string | null | undefined): string {
  const place = (location ?? '').trim();
  const mode = (workTypeLabel ?? '').trim();
  if (!mode || place.toLowerCase().split(/[\s·,]+/).includes(mode.toLowerCase())) return place;
  return [place, mode].filter(Boolean).join(' · ');
}

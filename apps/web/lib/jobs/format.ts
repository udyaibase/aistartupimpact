import { WORK_TYPES } from '@/lib/jobs/composer';
import type { CareersJob } from '@/lib/jobs/careers';

const label = (list: readonly { value: string; label: string }[], v: string | null) => (v ? list.find((x) => x.value === v)?.label : undefined);

/** Yearly salary range: ₹ lakh for INR, thousands for other currencies. */
export function salaryText(j: Pick<CareersJob, 'salaryMin' | 'salaryMax' | 'salaryCurrency'>): string | null {
  if (!j.salaryMin && !j.salaryMax) return null;
  if (j.salaryCurrency === 'INR') {
    const l = (n: number) => (n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 });
    return j.salaryMin && j.salaryMax && j.salaryMin !== j.salaryMax ? `₹${l(j.salaryMin)}–${l(j.salaryMax)} L` : `₹${l((j.salaryMin || j.salaryMax)!)} L`;
  }
  const sym = ({ USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[j.salaryCurrency] ?? `${j.salaryCurrency} `;
  const k = (n: number) => `${Math.round(n / 1000)}K`;
  return j.salaryMin && j.salaryMax && j.salaryMin !== j.salaryMax ? `${sym}${k(j.salaryMin)}–${k(j.salaryMax)}` : `${sym}${k((j.salaryMin || j.salaryMax)!)}`;
}

export function placeText(j: Pick<CareersJob, 'workType' | 'city' | 'country' | 'location'>): string {
  if (j.workType === 'REMOTE') return j.country ? `Remote · ${j.country}` : 'Remote';
  return [j.city || j.location, label(WORK_TYPES, j.workType)].filter(Boolean).join(' · ');
}

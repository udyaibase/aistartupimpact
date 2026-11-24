import type { PoolCandidate } from './talent';

/**
 * Talent pool filters, shared by the Talent pool page and saved-search alerts (lib/employer/talent-alerts.ts), so an
 * alert finds exactly the people the same search shows on the page. No server imports.
 */

export const EXPERIENCE_RANGES = {
  '': { label: 'Any experience', min: null, max: null },
  '0-2': { label: '0–2 years', min: 0, max: 2 },
  '3-5': { label: '3–5 years', min: 3, max: 5 },
  '6-10': { label: '6–10 years', min: 6, max: 10 },
  '10+': { label: '10+ years', min: 10, max: null },
} as const;
export type ExperienceRange = keyof typeof EXPERIENCE_RANGES;

/** Furthest stage reached in any of their applications (PoolCandidate.furthestRank). */
export const STAGE_FILTERS = {
  '': { label: 'Any stage', min: 0 },
  screened: { label: 'Screened or further', min: 1 },
  interviewed: { label: 'Interviewed or further', min: 3 },
  final: { label: 'Reached the final decision', min: 4 },
} as const;
export type StageFilter = keyof typeof STAGE_FILTERS;

/** How recently they applied (their latest application to you). */
export const APPLIED_WITHIN = {
  '': { label: 'Any time', days: null },
  // Not plain numbers: JavaScript lists number-like keys first, which would put "Any time" last in the menu.
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 3 months', days: 90 },
  '180d': { label: 'Last 6 months', days: 180 },
} as const;
export type AppliedWithin = keyof typeof APPLIED_WITHIN;

export interface TalentFilters {
  q: string;
  skill: string;
  tag: string;
  exp: ExperienceRange;
  stage: StageFilter;
  within: AppliedWithin;
}

export const EMPTY_FILTERS: TalentFilters = { q: '', skill: '', tag: '', exp: '', stage: '', within: '' };

const pick = <T extends string>(v: unknown, allowed: Record<string, unknown>): T => (typeof v === 'string' && v in allowed ? v : '') as T;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Safe filters from anything saved or sent. */
export function cleanTalentFilters(raw: unknown): TalentFilters {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    q: text(r.q, 80),
    skill: text(r.skill, 60),
    tag: text(r.tag, 40),
    exp: pick<ExperienceRange>(r.exp, EXPERIENCE_RANGES),
    stage: pick<StageFilter>(r.stage, STAGE_FILTERS),
    within: pick<AppliedWithin>(r.within, APPLIED_WITHIN),
  };
}

export const hasFilters = (f: TalentFilters) => Object.values(f).some(Boolean);

/** Does this pool member match the filters? */
export function matchesTalentFilters(p: PoolCandidate, f: TalentFilters, now = Date.now()): boolean {
  if (f.q && !`${p.fullName} ${p.currentTitle ?? ''} ${p.currentCompany ?? ''} ${p.city ?? ''} ${p.appliedFor} ${p.tags.join(' ')}`.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.skill && !p.skills.includes(f.skill)) return false;
  if (f.tag && !p.tags.includes(f.tag)) return false;
  const range = EXPERIENCE_RANGES[f.exp];
  if (range.min != null || range.max != null) {
    if (p.experienceYears == null) return false;
    if (range.min != null && p.experienceYears < range.min) return false;
    if (range.max != null && p.experienceYears > range.max) return false;
  }
  if (p.furthestRank < STAGE_FILTERS[f.stage].min) return false;
  const days = APPLIED_WITHIN[f.within].days;
  if (days != null && now - new Date(p.appliedAt).getTime() > days * 864e5) return false;
  return true;
}

/** A short description of a search, e.g. "React · 3–5 years · Interviewed or further". */
export function describeFilters(f: TalentFilters): string {
  const parts = [
    f.q && `“${f.q}”`, f.skill, f.tag && `#${f.tag}`,
    f.exp && EXPERIENCE_RANGES[f.exp].label, f.stage && STAGE_FILTERS[f.stage].label, f.within && APPLIED_WITHIN[f.within].label,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Everyone in the pool';
}

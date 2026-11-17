/** Sponsor tiers (safe for client components; no database imports). */
export const SPONSOR_TIERS = [
  { value: 'GOLD', label: 'Gold' },
  { value: 'SILVER', label: 'Silver' },
  { value: 'BRONZE', label: 'Bronze' },
  { value: 'PARTNER', label: 'Partner' },
] as const;
export const MAX_SPONSORS = 30;
export const tierLabel = (t: string) => SPONSOR_TIERS.find((x) => x.value === t)?.label ?? 'Partner';
export const tierRank = (t: string) => Math.max(0, SPONSOR_TIERS.findIndex((x) => x.value === t));

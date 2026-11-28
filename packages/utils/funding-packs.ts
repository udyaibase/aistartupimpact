/**
 * Funding-data packs sold on /funding. Client-safe. Prices include 18% GST (consumer pricing); invoices split it out.
 * These are the built-in values; Admin → Billing → Plans & prices can change prices and sizes (see catalog.ts).
 */

export const PACK_KEYS = ['STARTER', 'GROWTH', 'PRO', 'SCALE', 'FULL'] as const;
export type PackKey = (typeof PACK_KEYS)[number];

export interface PackDef {
  key: PackKey;
  name: string;
  /** Startups in the file; null = every startup. */
  limit: number | null;
  totalPaise: number;
  /** Days the emailed link keeps working, and how many downloads it allows in that time. */
  accessDays: number;
  downloads: number;
  blurb: string;
}

export const PACKS: Record<PackKey, PackDef> = {
  STARTER: { key: 'STARTER', name: 'Starter', limit: 50, totalPaise: 19900, accessDays: 7, downloads: 5, blurb: 'Quick research' },
  GROWTH: { key: 'GROWTH', name: 'Growth', limit: 250, totalPaise: 39900, accessDays: 7, downloads: 5, blurb: 'Analysts and journalists' },
  PRO: { key: 'PRO', name: 'Pro', limit: 500, totalPaise: 69900, accessDays: 7, downloads: 5, blurb: 'Funds and consultants' },
  SCALE: { key: 'SCALE', name: 'Scale', limit: 1000, totalPaise: 149900, accessDays: 7, downloads: 5, blurb: 'Research teams' },
  FULL: { key: 'FULL', name: 'Full Dataset', limit: null, totalPaise: 399900, accessDays: 365, downloads: 100, blurb: 'Every startup and field, fresh data for 12 months' },
};

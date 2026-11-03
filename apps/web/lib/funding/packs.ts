/**
 * Funding-data products sold on /funding, and the buyer's choices. Client-safe (the picker uses it for live
 * prices and checks); the server re-parses everything, so nothing here is trusted from the browser.
 *
 * Prices include 18% GST (consumer pricing); invoices split it out. Packs are sized in startups, ranked by most
 * recent funding then amount raised, so a small pack holds the most relevant companies for the filters.
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

export const isPackKey = (v: unknown): v is PackKey => typeof v === 'string' && (PACK_KEYS as readonly string[]).includes(v);

/** GST-inclusive total → taxable value + GST (18%), as printed on the invoice. */
export function splitInclusive(totalPaise: number) {
  const amount = Math.round((totalPaise * 100) / 118);
  return { amount, gst: totalPaise - amount, total: totalPaise };
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ── Buyer's choices ──────────────────────────────────────────────────────────

export const PERIODS = ['all', '30d', '90d', '12m', 'ytd', 'custom'] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Period, string> = {
  all: 'All time', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months', ytd: 'This year', custom: 'Custom dates',
};

/** Optional sheets; Startups and Funding Rounds are always included. */
export const SHEETS = ['summary', 'sector', 'stage', 'city', 'investors', 'quarterly'] as const;
export type SheetKey = (typeof SHEETS)[number];
export const SHEET_LABELS: Record<SheetKey, string> = {
  summary: 'Summary', sector: 'By sector', stage: 'By stage', city: 'By city', investors: 'Investor leaderboard', quarterly: 'Quarterly trend',
};

export interface FundingFilters {
  period: Period;
  /** YYYY-MM-DD, custom period only. */
  from: string | null;
  to: string | null;
  sectors: string[];
  stages: string[];
  cities: string[];
  /** Only startups with at least one funding round (in the period, when one is chosen). */
  fundedOnly: boolean;
  currency: 'INR' | 'USD';
  sheets: SheetKey[];
}

export const DEFAULT_FILTERS: FundingFilters = {
  period: 'all', from: null, to: null, sectors: [], stages: [], cities: [], fundedOnly: false, currency: 'INR', sheets: [...SHEETS],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Untrusted input → clean filters (unknown values dropped, lists capped). */
export function parseFilters(raw: unknown): FundingFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 100)).filter(Boolean))].slice(0, 50) : []);
  const date = (v: unknown) => (typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const period = (PERIODS as readonly string[]).includes(r.period as string) ? (r.period as Period) : 'all';
  let from = period === 'custom' ? date(r.from) : null;
  let to = period === 'custom' ? date(r.to) : null;
  if (from && to && from > to) [from, to] = [to, from];
  const sheets = list(r.sheets).filter((s): s is SheetKey => (SHEETS as readonly string[]).includes(s));
  return {
    period, from, to,
    sectors: list(r.sectors), stages: list(r.stages), cities: list(r.cities),
    fundedOnly: r.fundedOnly === true,
    currency: r.currency === 'USD' ? 'USD' : 'INR',
    sheets: Array.isArray(r.sheets) ? sheets : [...SHEETS],
  };
}

/** Start/end of the chosen period (end exclusive), or nulls for all time. */
export function periodRange(f: Pick<FundingFilters, 'period' | 'from' | 'to'>, now = new Date()): { start: Date | null; end: Date | null } {
  const DAY = 864e5;
  switch (f.period) {
    case '30d': return { start: new Date(now.getTime() - 30 * DAY), end: null };
    case '90d': return { start: new Date(now.getTime() - 90 * DAY), end: null };
    case '12m': return { start: new Date(now.getTime() - 365 * DAY), end: null };
    case 'ytd': return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: null };
    case 'custom': return { start: f.from ? new Date(`${f.from}T00:00:00Z`) : null, end: f.to ? new Date(new Date(`${f.to}T00:00:00Z`).getTime() + DAY) : null };
    default: return { start: null, end: null };
  }
}

// ── Which packs make sense for a selection ───────────────────────────────────

export interface PackOption {
  key: PackKey;
  /** Startups the buyer would get. */
  gets: number;
  available: boolean;
  /** Why it can't be bought, e.g. "Your selection fits in Growth". */
  note: string | null;
}

/**
 * Limited packs give the top N of the matching startups. A pack is offered when it holds fewer than the match
 * (they get N) or is the smallest one that holds them all (they get every match); bigger packs aren't sold,
 * so nobody pays for rows that don't exist. Full Dataset is the whole directory with every field.
 */
export function packOptions(matched: number, directoryTotal: number): PackOption[] {
  const limited = PACK_KEYS.filter((k) => PACKS[k].limit !== null);
  const fits = limited.find((k) => PACKS[k].limit! >= matched) ?? null;
  const out: PackOption[] = limited.map((k) => {
    const limit = PACKS[k].limit!;
    if (matched === 0) return { key: k, gets: 0, available: false, note: 'No startups match your filters' };
    if (limit < matched) return { key: k, gets: limit, available: true, note: null };
    if (k === fits) return { key: k, gets: matched, available: true, note: null };
    return { key: k, gets: matched, available: false, note: `Your selection fits in ${PACKS[fits!].name}` };
  });
  out.push({ key: 'FULL', gets: directoryTotal, available: directoryTotal > 0, note: null });
  return out;
}

/** The pack a selection should default to: the smallest one that holds every match. */
export function suggestedPack(options: Pick<PackOption, 'key' | 'available'>[]): PackKey | null {
  // Available limited packs are the smaller ones plus the one that fits, so the fitting one is the last of them.
  const limited = options.filter((o) => o.available && o.key !== 'FULL');
  return limited[limited.length - 1]?.key ?? options.find((o) => o.available)?.key ?? null;
}

/** Shown next to the required checkbox and stored with each consent. */
export const CONSENT_TEXT = 'I agree to the Terms and Privacy Policy and to receive the Udyaibase newsletter. I can unsubscribe at any time.';
export const CONSENT_VERSION = 2;

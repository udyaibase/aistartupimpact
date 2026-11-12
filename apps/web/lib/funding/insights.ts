/**
 * Funding analytics shared by the funding tracker, monthly reports, city hubs and investor pages.
 * Pure functions over the round list (no database access), so every page computes the same numbers and the
 * logic is unit-tested. Amounts are stored in the smallest unit: amountInr in paise, amountUsd in cents.
 */
import { inrLabel, roundLabel, usdLabel } from '@/lib/funding/format';

export const INR_PER_USD = 84;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const;

export interface FundingRoundRow {
  id: string;
  slug: string | null;
  roundType: string;
  amountInr: number | string | null;
  amountUsd: number | string | null;
  announcedAt: string;
  leadInvestors: string[] | null;
  allInvestors: string[] | null;
  startupName: string;
  startupSlug: string;
  headquartersCity: string | null;
  startupCategory: string | null;
  startupLogoUrl: string | null;
  /** Headquartered in India (standard city list), set by the server loader. */
  inIndia: boolean;
  /** Standardised city name ("Bangalore" → "Bengaluru"). */
  city: string | null;
}

export type Scope = 'india' | 'global';

// ── Units ────────────────────────────────────────────────────────────────────

/** Round size in paise: the rupee amount when recorded, otherwise converted from dollars. */
export function inrPaiseOf(r: Pick<FundingRoundRow, 'amountInr' | 'amountUsd'>): number {
  const inr = Number(r.amountInr ?? 0);
  if (inr > 0) return inr;
  return Math.round(Number(r.amountUsd ?? 0) * INR_PER_USD); // cents × 84 = paise
}

/** Round size in cents: the dollar amount when recorded, otherwise converted from rupees. */
export function usdCentsOf(r: Pick<FundingRoundRow, 'amountInr' | 'amountUsd'>): number {
  const usd = Number(r.amountUsd ?? 0);
  if (usd > 0) return usd;
  return Math.round(Number(r.amountInr ?? 0) / INR_PER_USD);
}

/** "₹66,297 Cr ($7.9B)" style money for a paise total. */
export function moneyLabel(paise: number): string {
  const inr = inrLabel(paise);
  const usd = usdLabel(Math.round(paise / INR_PER_USD));
  return inr ? (usd ? `${inr} (${usd})` : inr) : 'undisclosed';
}

// ── Slugs and dates ──────────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Calendar parts in India time (a round announced late on the 31st UTC belongs to the next IST day). */
function istParts(iso: string): { year: number; month: number } {
  const d = new Date(new Date(iso).getTime() + 5.5 * 36e5);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** "november-2026" for a date. */
export function monthSlugOf(iso: string): string {
  const { year, month } = istParts(iso);
  return `${MONTHS[month]}-${year}`;
}

/** "november-2026" → { year: 2026, month: 10 }, or null when it isn't a month slug. */
export function parseMonthSlug(slug: string): { year: number; month: number } | null {
  const m = /^([a-z]+)-(\d{4})$/.exec(slug);
  if (!m) return null;
  const month = (MONTHS as readonly string[]).indexOf(m[1]);
  const year = Number(m[2]);
  return month >= 0 && year >= 2000 && year <= 2100 ? { year, month } : null;
}

export const monthTitle = (year: number, month: number) => `${MONTHS[month][0].toUpperCase()}${MONTHS[month].slice(1)} ${year}`;

export const inScope = (rounds: FundingRoundRow[], scope: Scope) => (scope === 'india' ? rounds.filter((r) => r.inIndia) : rounds);

// ── Aggregates ───────────────────────────────────────────────────────────────

export interface Group { name: string; slug: string; deals: number; paise: number }

function groupBy(rounds: FundingRoundRow[], keys: (r: FundingRoundRow) => string[]): Group[] {
  const m = new Map<string, Group>();
  for (const r of rounds) {
    for (const name of new Set(keys(r).map((k) => k.trim()).filter(Boolean))) {
      const slug = slugify(name);
      if (!slug) continue;
      const g = m.get(slug) ?? { name, slug, deals: 0, paise: 0 };
      g.deals += 1;
      g.paise += inrPaiseOf(r);
      m.set(slug, g);
    }
  }
  return [...m.values()].sort((a, b) => b.deals - a.deals || b.paise - a.paise);
}

export const byCity = (rounds: FundingRoundRow[]) => groupBy(rounds, (r) => (r.city ? [r.city] : []));
/** Lead and participating investors; each round counts once per investor. */
export const byInvestor = (rounds: FundingRoundRow[]) => groupBy(rounds, (r) => [...(r.leadInvestors ?? []), ...(r.allInvestors ?? [])]);
export const bySector = (rounds: FundingRoundRow[]) => groupBy(rounds, (r) => [r.startupCategory || 'Other']);
export const byStage = (rounds: FundingRoundRow[]) => groupBy(rounds, (r) => [roundLabel(r.roundType)]);

export const newestFirst = (rounds: FundingRoundRow[]) => [...rounds].sort((a, b) => b.announcedAt.localeCompare(a.announcedAt));

export interface FundingSummary {
  deals: number;
  paise: number;
  year: number;
  ytd: { deals: number; paise: number };
  lastYearSamePeriod: { deals: number; paise: number };
  thisMonth: { deals: number; paise: number; label: string };
  largest: FundingRoundRow | null;
  topCities: Group[];
  topInvestors: Group[];
  topSectors: Group[];
  latestDate: string | null;
}

export function summarize(rounds: FundingRoundRow[], now = new Date()): FundingSummary {
  const { year, month } = istParts(now.toISOString());
  const sum = (rs: FundingRoundRow[]) => ({ deals: rs.length, paise: rs.reduce((n, r) => n + inrPaiseOf(r), 0) });
  // Same calendar window last year, for a fair year-on-year comparison.
  const dayOfYear = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 5.5 * 36e5);
    return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5);
  };
  const today = dayOfYear(now.toISOString());
  const ytd = rounds.filter((r) => istParts(r.announcedAt).year === year);
  const lastYtd = rounds.filter((r) => istParts(r.announcedAt).year === year - 1 && dayOfYear(r.announcedAt) <= today);
  const thisMonth = rounds.filter((r) => { const p = istParts(r.announcedAt); return p.year === year && p.month === month; });
  const largest = rounds.reduce<FundingRoundRow | null>((best, r) => (!best || inrPaiseOf(r) > inrPaiseOf(best) ? r : best), null);
  const sorted = newestFirst(rounds);
  return {
    ...sum(rounds),
    year,
    ytd: sum(ytd),
    lastYearSamePeriod: sum(lastYtd),
    thisMonth: { ...sum(thisMonth), label: monthTitle(year, month) },
    largest,
    topCities: byCity(rounds).slice(0, 5),
    topInvestors: byInvestor(rounds).slice(0, 5),
    topSectors: bySector(rounds).filter((g) => g.name !== 'Other').slice(0, 5),
    latestDate: sorted[0]?.announcedAt ?? null,
  };
}

/** Months with at least `min` rounds, newest first. */
export function monthsWithRounds(rounds: FundingRoundRow[], min = 1): { slug: string; year: number; month: number; deals: number }[] {
  const m = new Map<string, { slug: string; year: number; month: number; deals: number }>();
  for (const r of rounds) {
    const { year, month } = istParts(r.announcedAt);
    const slug = `${MONTHS[month]}-${year}`;
    const e = m.get(slug) ?? { slug, year, month, deals: 0 };
    e.deals += 1;
    m.set(slug, e);
  }
  return [...m.values()].filter((e) => e.deals >= min).sort((a, b) => b.year - a.year || b.month - a.month);
}

export function roundsInMonth(rounds: FundingRoundRow[], year: number, month: number) {
  return rounds.filter((r) => { const p = istParts(r.announcedAt); return p.year === year && p.month === month; });
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;
const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

// ── Text ─────────────────────────────────────────────────────────────────────

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** A short written overview from live numbers (crawlable body text, refreshed with the page). */
export function summaryText(s: FundingSummary, scope: Scope): string {
  const where = scope === 'india' ? 'Indian AI startups' : 'AI startups worldwide';
  const parts: string[] = [];
  parts.push(`Udyaibase tracks ${plural(s.deals, 'funding round')} raised by ${where}, worth ${moneyLabel(s.paise)} in total.`);
  if (s.ytd.deals > 0) {
    const change = pct(s.ytd.paise, s.lastYearSamePeriod.paise);
    parts.push(`In ${s.year} so far, ${plural(s.ytd.deals, 'round')} ${s.ytd.deals === 1 ? 'has' : 'have'} raised ${moneyLabel(s.ytd.paise)}${change != null ? ` (${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on the same period last year)` : ''}.`);
  }
  if (s.largest) parts.push(`The largest round on record is ${s.largest.startupName.trim()}'s ${moneyLabel(inrPaiseOf(s.largest))} ${roundLabel(s.largest.roundType)} (${longDate(s.largest.announcedAt)}).`);
  if (s.topCities.length) parts.push(`${list(s.topCities.slice(0, 3).map((c) => c.name))} lead by number of deals.`);
  if (s.topInvestors.length) parts.push(`The most active investors are ${list(s.topInvestors.slice(0, 3).map((i) => `${i.name} (${i.deals} deals)`))}.`);
  return parts.join(' ');
}

export interface Faq { q: string; a: string }

/** FAQ shown on the page and in FAQPage structured data (same text in both, as Google requires). */
export function fundingFaq(s: FundingSummary, scope: Scope, updatedOn: string): Faq[] {
  const where = scope === 'india' ? 'in India' : 'worldwide';
  const who = scope === 'india' ? 'Indian AI startups' : 'AI startups';
  const faq: Faq[] = [
    {
      q: `How much funding have AI startups raised ${where} in ${s.year}?`,
      a: s.ytd.deals
        ? `${who[0].toUpperCase()}${who.slice(1)} have raised ${moneyLabel(s.ytd.paise)} across ${plural(s.ytd.deals, 'funding round')} in ${s.year} so far, according to Udyaibase's live tracker.`
        : `No ${who} funding rounds have been recorded for ${s.year} yet.`,
    },
  ];
  if (s.largest) faq.push({
    q: `Which AI startup raised the biggest funding round ${where}?`,
    a: `${s.largest.startupName.trim()} raised the largest round tracked: ${moneyLabel(inrPaiseOf(s.largest))} in a ${roundLabel(s.largest.roundType)} round announced on ${longDate(s.largest.announcedAt)}.`,
  });
  if (s.topInvestors.length) faq.push({
    q: `Who are the most active investors in ${who}?`,
    a: `By number of deals: ${list(s.topInvestors.map((i) => `${i.name} (${i.deals})`))}.`,
  });
  if (s.topCities.length) faq.push({
    q: `Which cities have the most AI startup funding ${where}?`,
    a: `By number of funding rounds: ${list(s.topCities.map((c) => `${c.name} (${c.deals} rounds, ${moneyLabel(c.paise)})`))}.`,
  });
  if (s.deals) faq.push({
    q: `What is the average AI startup funding round size ${where}?`,
    a: `The average tracked round is ${moneyLabel(Math.round(s.paise / s.deals))}, across ${plural(s.deals, 'round')}.`,
  });
  faq.push({
    q: 'How often is this AI funding data updated?',
    a: `The tracker updates as new rounds are announced and is refreshed daily. Last updated ${updatedOn}.`,
  });
  return faq;
}

// ── Hub pages ────────────────────────────────────────────────────────────────

/** A hub page with fewer rounds than this is thin: still viewable, but noindex and left out of the sitemap. */
export const HUB_MIN_ROUNDS = { month: 3, city: 3, investor: 2 } as const;

export const roundsInCity = (rounds: FundingRoundRow[], citySlug: string) => rounds.filter((r) => r.city && slugify(r.city) === citySlug);

export const roundsWithInvestor = (rounds: FundingRoundRow[], investorSlug: string) =>
  rounds.filter((r) => [...(r.leadInvestors ?? []), ...(r.allInvestors ?? [])].some((i) => slugify(i) === investorSlug));

/** The investor's name as written most often in the data. */
export function investorName(rounds: FundingRoundRow[], investorSlug: string): string | null {
  const counts = new Map<string, number>();
  for (const r of rounds) for (const i of [...(r.leadInvestors ?? []), ...(r.allInvestors ?? [])]) {
    if (slugify(i) === investorSlug) counts.set(i.trim(), (counts.get(i.trim()) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

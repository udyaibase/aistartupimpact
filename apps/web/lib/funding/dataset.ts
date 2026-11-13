import { prisma } from '@udyaibase/database';
import { standardizeCityName } from '@udyaibase/utils/src/cities';
import { periodRange, type FundingFilters } from '@/lib/funding/packs';
import { latestUsdInr } from '@/lib/fx';

/**
 * The funding dataset behind the paid Excel downloads: approved startups from the directory plus their funding
 * rounds. `selectStartups` is the single place that applies the buyer's filters and ranking, used by the live
 * count on /funding and by the file itself, so the preview and the download always agree.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export interface DataRound {
  id: string; startupId: string; roundType: string; announcedAt: Date;
  /** Rupees and dollars (whole units) as stored: the second converted at the announcement-date rate. */
  inr: number; usd: number; disclosed: boolean;
  /** USD→INR for this round (its announcement-date rate), used to convert its valuation. */
  usdInr: number;
  leadInvestors: string[]; allInvestors: string[]; valuationInr: number | null; sourceUrl: string | null;
}

export interface DataStartup {
  id: string; name: string; slug: string; sector: string | null; city: string | null; stage: string;
  foundedYear: number | null; websiteUrl: string | null; linkedinUrl: string | null; founders: string[];
  employeeCount: number | null; profileUrl: string;
  /** Directory total when no rounds are recorded (rupees), and in dollars at today's rate. */
  listedTotalInr: number;
  listedTotalUsd: number;
  rounds: DataRound[];
}

export const stageLabel = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Pre /, 'Pre-');

let cache: { at: number; startups: DataStartup[]; usdInrToday: number } | null = null;
const TTL = 10 * 60_000;

/** All approved, live startups with their rounds (newest first). Cached per server instance for 10 minutes. */
export async function loadDataset(): Promise<DataStartup[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.startups;
  const [startups, rounds, usdInrToday] = await Promise.all([
    prisma.startup.findMany({
      where: { deletedAt: null, isApproved: true },
      select: {
        id: true, name: true, slug: true, category: true, headquartersCity: true, stage: true, foundedYear: true,
        websiteUrl: true, linkedinUrl: true, founders: true, employeeCount: true, totalFundingInr: true,
      },
    }),
    prisma.fundingRound.findMany({
      where: { Startup: { deletedAt: null, isApproved: true } },
      orderBy: { announcedAt: 'desc' },
      select: { id: true, startupId: true, roundType: true, announcedAt: true, amountInr: true, amountUsd: true, leadInvestors: true, allInvestors: true, valuation: true, sourceUrl: true },
    }),
    latestUsdInr(),
  ]);
  const byStartup = new Map<string, DataRound[]>();
  for (const r of rounds) {
    const inrPaise = Number(r.amountInr ?? 0);
    const usdCents = Number(r.amountUsd ?? 0);
    // Both amounts are stored (the database converts at the announcement-date rate), so their ratio is that rate.
    const rate = inrPaise > 0 && usdCents > 0 ? inrPaise / usdCents : usdInrToday;
    const inr = inrPaise > 0 ? inrPaise / 100 : (usdCents / 100) * rate;
    const usd = usdCents > 0 ? usdCents / 100 : inrPaise / 100 / rate;
    const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
    const list = byStartup.get(r.startupId) ?? [];
    list.push({
      id: r.id, startupId: r.startupId, roundType: r.roundType, announcedAt: r.announcedAt,
      inr: Math.round(inr), usd: Math.round(usd), disclosed: inr > 0, usdInr: rate,
      leadInvestors: clean(r.leadInvestors), allInvestors: clean([...r.leadInvestors, ...r.allInvestors]),
      valuationInr: r.valuation ? Number(r.valuation) / 100 : null, sourceUrl: r.sourceUrl,
    });
    byStartup.set(r.startupId, list);
  }
  const data: DataStartup[] = startups.map((s) => ({
    id: s.id, name: s.name.trim(), slug: s.slug, sector: s.category?.trim() || null,
    city: s.headquartersCity ? standardizeCityName(s.headquartersCity) : null, stage: s.stage,
    foundedYear: s.foundedYear, websiteUrl: s.websiteUrl, linkedinUrl: s.linkedinUrl, founders: s.founders.filter(Boolean),
    employeeCount: s.employeeCount, profileUrl: `${SITE}/startups/${s.slug}`,
    listedTotalInr: Number(s.totalFundingInr ?? 0) / 100,
    listedTotalUsd: Math.round(Number(s.totalFundingInr ?? 0) / 100 / usdInrToday),
    rounds: byStartup.get(s.id) ?? [],
  }));
  cache = { at: Date.now(), startups: data, usdInrToday };
  return data;
}

/** Today's USD→INR used for the dataset's few figures without a round date (stated in the file). */
export const datasetUsdInrToday = () => cache?.usdInrToday ?? null;

/** A startup with only the rounds inside the chosen period. */
export interface SelectedStartup extends DataStartup { periodRounds: DataRound[]; raisedInr: number; raisedUsd: number; lastRoundAt: Date | null }

const sum = (rs: DataRound[], k: 'inr' | 'usd') => rs.reduce((n, r) => n + r[k], 0);

/**
 * Apply filters, then rank: most recent funding first, then amount raised, then name. With a period chosen, only
 * startups that raised in it match; "funded only" drops startups without any recorded round.
 * `limit` null returns every match. `ignoreFilters` (Full Dataset) keeps everything but the period.
 */
export function selectStartups(all: DataStartup[], f: FundingFilters, limit: number | null, opts: { ignoreFilters?: boolean } = {}): { matched: number; startups: SelectedStartup[] } {
  const { start, end } = opts.ignoreFilters ? { start: null, end: null } : periodRange(f);
  const inPeriod = (r: DataRound) => (!start || r.announcedAt >= start) && (!end || r.announcedAt < end);
  const lower = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));
  const sectors = lower(f.sectors), stages = lower(f.stages), cities = lower(f.cities);
  const periodChosen = !!(start || end);

  const matches: SelectedStartup[] = [];
  for (const s of all) {
    if (!opts.ignoreFilters) {
      if (sectors.size && !(s.sector && sectors.has(s.sector.toLowerCase()))) continue;
      if (stages.size && !stages.has(s.stage.toLowerCase())) continue;
      if (cities.size && !(s.city && cities.has(s.city.toLowerCase()))) continue;
    }
    const periodRounds = s.rounds.filter(inPeriod);
    if ((periodChosen || (f.fundedOnly && !opts.ignoreFilters)) && periodRounds.length === 0) continue;
    const raisedInr = s.rounds.length ? sum(periodRounds, 'inr') : s.listedTotalInr;
    matches.push({
      ...s, periodRounds, raisedInr: Math.round(raisedInr),
      raisedUsd: Math.round(s.rounds.length ? sum(periodRounds, 'usd') : s.listedTotalUsd),
      lastRoundAt: periodRounds[0]?.announcedAt ?? null,
    });
  }
  matches.sort((a, b) => (b.lastRoundAt?.getTime() ?? 0) - (a.lastRoundAt?.getTime() ?? 0) || b.raisedInr - a.raisedInr || a.name.localeCompare(b.name));
  return { matched: matches.length, startups: limit === null ? matches : matches.slice(0, limit) };
}

/** Choices for the filter picker, with how many startups each has. */
export function facets(all: DataStartup[]) {
  const count = (key: (s: DataStartup) => string | null) => {
    const m = new Map<string, number>();
    for (const s of all) { const k = key(s); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
  };
  return {
    sectors: count((s) => s.sector),
    stages: count((s) => s.stage).map((x) => ({ ...x, label: stageLabel(x.value) })),
    cities: count((s) => s.city),
    total: all.length,
    funded: all.filter((s) => s.rounds.length).length,
  };
}

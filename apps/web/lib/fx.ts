import { prisma } from '@udyaibase/database';
import { cached } from '@/lib/cache';

/**
 * USD↔INR rates. Funding rounds are converted once, at the rate on their announcement date, by a database trigger
 * (funding_round_fill_fx) that reads the daily rates loaded here, so totals never drift with today's rate.
 * Today's rate (latestUsdInr) is only for "right now" conversions such as a price typed in dollars.
 *
 * Source: the European Central Bank's daily reference rates, served by Frankfurter (free, no key). Rates exist for
 * business days; a weekend or holiday uses the last earlier rate.
 */
const API = 'https://api.frankfurter.dev/v1';
const HISTORY_FROM = '2000-01-01';
/** Only when no rate has ever been loaded (a fresh database before its first daily run). */
export const FALLBACK_USD_INR = 94;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function fetchRates(from: string, to: string): Promise<{ day: string; usdInr: number }[]> {
  const res = await fetch(`${API}/${from}..${to}?base=USD&symbols=INR`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`exchange rates: HTTP ${res.status}`);
  const body = (await res.json()) as { rates?: Record<string, { INR?: number }> };
  return Object.entries(body.rates ?? {})
    .map(([day, r]) => ({ day, usdInr: Number(r.INR) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && Number.isFinite(r.usdInr) && r.usdInr > 10 && r.usdInr < 500);
}

/** Today's USD→INR (latest published rate), cached for 6 hours. Never throws. */
export async function latestUsdInr(): Promise<number> {
  try {
    return await cached('fx:usd-inr:latest', { ttl: 6 * 3600, staleTtl: 24 * 3600 }, async () => {
      const row = await prisma.exchangeRate.findFirst({ orderBy: { day: 'desc' }, select: { usdInr: true } });
      if (row) return row.usdInr;
      const today = isoDay(new Date());
      const recent = await fetchRates(isoDay(new Date(Date.now() - 10 * 864e5)), today);
      if (!recent.length) throw new Error('no recent rate');
      return recent[recent.length - 1].usdInr;
    });
  } catch (err) {
    console.error('[fx] latest rate unavailable, using fallback', err instanceof Error ? err.message : err);
    return FALLBACK_USD_INR;
  }
}

/**
 * Daily: load rates published since the last run (the full history from 2000 on the first run), then bring funding
 * rounds in line: amounts calculated at a placeholder or outdated rate are recalculated at their announcement-date
 * rate. On the first run, rounds saved earlier with a fixed rate in the code (83, 84 or 95.4) are converted too.
 */
export async function refreshExchangeRates(): Promise<{ ratesAdded: number; roundsUpdated: number }> {
  const last = await prisma.exchangeRate.findFirst({ orderBy: { day: 'desc' }, select: { day: true } });
  const firstRun = !last;
  const from = last ? isoDay(new Date(last.day.getTime() + 864e5)) : HISTORY_FROM;
  const today = isoDay(new Date());

  let ratesAdded = 0;
  if (from <= today) {
    const rows = await fetchRates(from, today);
    if (rows.length) {
      ratesAdded = (await prisma.exchangeRate.createMany({
        data: rows.map((r) => ({ day: new Date(`${r.day}T00:00:00Z`), usdInr: r.usdInr, source: 'ECB' })),
        skipDuplicates: true,
      })).count;
    }
  }

  let roundsUpdated = 0;
  if (firstRun) {
    // Rounds saved before this change carry a fixed rate from the code. Decide which amount a person typed: a whole
    // number of lakh rupees with an uneven dollar figure means rupees were typed; otherwise dollars.
    roundsUpdated += await prisma.$executeRaw`
      UPDATE "FundingRound"
      SET "fxDerived" = CASE
        WHEN "amountInr" % 10000000 = 0 AND "amountUsd" % 1000000 <> 0 THEN 'USD'
        ELSE 'INR' END
      WHERE "fxDerived" IS NULL AND COALESCE("amountUsd", 0) > 0 AND COALESCE("amountInr", 0) > 0
        AND (ABS("amountInr"::float / "amountUsd" - 83) < 0.08 OR ABS("amountInr"::float / "amountUsd" - 84) < 0.08
          OR ABS("amountInr"::float / "amountUsd" - 95.4) < 0.08)`;
  }
  // Recalculate: rounds missing one amount, and calculated amounts whose rate isn't their date's rate (placeholder
  // rate before rates were loaded, or the first-run conversion above). The trigger does the arithmetic.
  roundsUpdated += await prisma.$executeRaw`
    UPDATE "FundingRound" SET "fxUsdInr" = "fxUsdInr"
    WHERE (COALESCE("amountUsd", 0) > 0 AND COALESCE("amountInr", 0) = 0)
       OR (COALESCE("amountInr", 0) > 0 AND COALESCE("amountUsd", 0) = 0)
       OR ("fxDerived" IS NOT NULL AND "fxUsdInr" IS DISTINCT FROM usd_inr_on("announcedAt"))`;

  return { ratesAdded, roundsUpdated };
}

/**
 * Impact Score Algorithm v1
 *
 * Score = Funding(50) + Employees(20) + Stage(15) + Age(15) = 100
 *
 * Log scales used for funding & employees so early growth is rewarded proportionally.
 */

export interface ImpactScoreBreakdown {
  total: number;
  funding: { score: number; max: number; label: string };
  employees: { score: number; max: number; label: string };
  stage: { score: number; max: number; label: string };
  age: { score: number; max: number; label: string };
}

// Stage score map. Every StartupStage value needs an entry: a missing one scores 0 (tested).
const STAGE_SCORES: Record<string, number> = {
  BOOTSTRAPPED: 4,
  IDEA: 1,
  PRE_SEED: 3,
  SEED: 6,
  PRE_SERIES_A: 8,
  SERIES_A: 9,
  PRE_SERIES_B: 10,
  SERIES_B: 12,
  PRE_SERIES_C: 12,
  SERIES_C: 13,
  PRE_SERIES_D: 13,
  SERIES_D: 14,
  SERIES_E: 14,
  SERIES_F: 14,
  SERIES_G: 14,
  SERIES_I: 14,
  SERIES_J: 14,
  GROWTH: 14,
  PUBLIC: 15,
};

/**
 * Funding score (0–50) — log scale
 * $0        → 0
 * $100K     → 10
 * $1M       → 20
 * $10M      → 30
 * $50M      → 40
 * $100M+    → 50
 */
function fundingScore(amountUsdCents: number): number {
  const usd = amountUsdCents / 100; // cents → dollars
  if (!usd || usd <= 0) return 0;

  // log10 scale: log10($100K)=5, log10($1M)=6, log10($10M)=7, log10($100M)=8
  // Map [5, 8] → [10, 50] linearly
  const log = Math.log10(usd);
  if (log < 5) return Math.max(0, (log / 5) * 10); // below $100K
  const score = 10 + ((log - 5) / 3) * 40; // $100K–$1B range
  return Math.min(50, Math.round(score));
}

/**
 * Employee score (0–20) — log scale
 * 0–1       → 0
 * 10        → 5
 * 50        → 10
 * 200       → 15
 * 500+      → 20
 */
function employeeScore(count: number | null): number {
  if (!count || count <= 0) return 0;
  if (count >= 500) return 20;
  // log scale: log10(10)=1, log10(500)≈2.7 → map to 5–20
  const log = Math.log10(count);
  const score = (log / Math.log10(500)) * 20;
  return Math.min(20, Math.round(Math.max(0, score)));
}

/**
 * Stage score (0–15)
 */
function stageScore(stage: string | null): number {
  if (!stage) return 0;
  return STAGE_SCORES[stage] ?? 0;
}

/**
 * Company age score (0–15)
 * Capped at 8 years = 15 pts
 * Formula: min(years × 1.875, 15)
 */
function ageScore(foundedYear: number | null): number {
  if (!foundedYear) return 0;
  const currentYear = new Date().getFullYear();
  const years = Math.max(0, currentYear - foundedYear);
  return Math.min(15, Math.round(years * 1.875));
}

function fundingLabel(amountUsdCents: number): string {
  const usd = amountUsdCents / 100;
  if (!usd || usd <= 0) return 'No funding data';
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B raised`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M raised`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K raised`;
  return `$${usd.toFixed(0)} raised`;
}

function employeeLabel(count: number | null): string {
  if (!count || count <= 0) return 'No team data';
  if (count >= 500) return '500+ employees';
  return `${count}+ employees`;
}

function stageLabel(stage: string | null): string {
  const labels: Record<string, string> = {
    BOOTSTRAPPED: 'Bootstrapped',
    IDEA: 'Idea Stage',
    PRE_SEED: 'Pre-Seed',
    SEED: 'Seed',
    PRE_SERIES_A: 'Pre-Series A',
    SERIES_A: 'Series A',
    PRE_SERIES_B: 'Pre-Series B',
    SERIES_B: 'Series B',
    PRE_SERIES_C: 'Pre-Series C',
    SERIES_C: 'Series C',
    PRE_SERIES_D: 'Pre-Series D',
    SERIES_D: 'Series D',
    SERIES_E: 'Series E',
    SERIES_F: 'Series F',
    SERIES_G: 'Series G',
    SERIES_I: 'Series I',
    SERIES_J: 'Series J',
    GROWTH: 'Growth Stage',
    PUBLIC: 'Public Company',
  };
  return stage ? (labels[stage] || stage.replace(/_/g, ' ')) : 'Unknown stage';
}

function ageLabel(foundedYear: number | null): string {
  if (!foundedYear) return 'Founded year unknown';
  const years = new Date().getFullYear() - foundedYear;
  if (years <= 0) return `Founded ${foundedYear}`;
  return `${years} year${years !== 1 ? 's' : ''} old (Founded ${foundedYear})`;
}

/**
 * Main function — call this from admin actions and founder submit actions.
 * totalFundingUsdCents is the SUM of all FundingRound.amountUsd values (in cents).
 * If no funding rounds exist, pass 0.
 */
export function calculateImpactScore(params: {
  totalFundingUsdCents: number;
  employeeCount: number | null;
  stage: string | null;
  foundedYear: number | null;
}): ImpactScoreBreakdown {
  const f = fundingScore(params.totalFundingUsdCents);
  const e = employeeScore(params.employeeCount);
  const s = stageScore(params.stage);
  const a = ageScore(params.foundedYear);
  const total = f + e + s + a;

  return {
    total,
    funding: { score: f, max: 50, label: fundingLabel(params.totalFundingUsdCents) },
    employees: { score: e, max: 20, label: employeeLabel(params.employeeCount) },
    stage: { score: s, max: 15, label: stageLabel(params.stage) },
    age: { score: a, max: 15, label: ageLabel(params.foundedYear) },
  };
}

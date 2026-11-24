/**
 * Estimated OpenAI cost per call, for monitoring and budget alerts (not billing).
 * USD per 1M tokens; unknown models are priced as gpt-4o so estimates err high.
 * Check https://openai.com/api/pricing when changing models.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  // Added for the resume engine model comparison (2026-11). List prices as last known: verify on the pricing page.
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5': { input: 1.25, output: 10 },
};

/**
 * Share of the input price charged for prompt tokens served from OpenAI's prompt cache (repeated prompt starts,
 * e.g. the same job for many candidates). List discounts as last known: verify on the pricing page.
 */
function cachedShare(model: string): number {
  if (model.startsWith('gpt-5')) return 0.1;
  if (model.startsWith('gpt-4.1')) return 0.25;
  return 0.5; // gpt-4o family
}

export function aiCostMicroUsd(model: string, promptTokens: number, completionTokens: number, cachedTokens = 0): number {
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k));
  const p = PRICES[key ?? 'gpt-4o'];
  const cached = Math.max(0, Math.min(cachedTokens, promptTokens));
  return Math.round((promptTokens - cached) * p.input + cached * p.input * cachedShare(model) + completionTokens * p.output);
}

/** Daily and monthly budgets in USD (env overridable). Alerts fire at 80%. */
export function aiBudgets() {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return { dailyUsd: num(process.env.OPENAI_DAILY_BUDGET_USD, 5), monthlyUsd: num(process.env.OPENAI_MONTHLY_BUDGET_USD, 50) };
}

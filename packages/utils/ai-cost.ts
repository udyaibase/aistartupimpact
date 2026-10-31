/**
 * Estimated OpenAI cost per call, for monitoring and budget alerts (not billing).
 * USD per 1M tokens; unknown models are priced as gpt-4o so estimates err high.
 * Check https://openai.com/api/pricing when changing models.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
};

export function aiCostMicroUsd(model: string, promptTokens: number, completionTokens: number): number {
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k));
  const p = PRICES[key ?? 'gpt-4o'];
  return Math.round(promptTokens * p.input + completionTokens * p.output);
}

/** Daily and monthly budgets in USD (env overridable). Alerts fire at 80%. */
export function aiBudgets() {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return { dailyUsd: num(process.env.OPENAI_DAILY_BUDGET_USD, 5), monthlyUsd: num(process.env.OPENAI_MONTHLY_BUDGET_USD, 50) };
}

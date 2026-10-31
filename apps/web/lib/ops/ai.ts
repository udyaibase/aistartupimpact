import { prisma } from '@udyaibase/database';
import { aiBudgets, aiCostMicroUsd } from '@udyaibase/utils/ai-cost';
import { opsAlert } from '@/lib/ops/alert';
import { aiSpendUsd } from '@udyaibase/database/ops';

/**
 * Every OpenAI call goes through here: it records tokens, estimated cost and failures (never the prompt
 * or the answer), alerts at 80% of the daily or monthly budget, and with OPENAI_HARD_STOP=true refuses
 * calls once a budget is used up (features already fall back when AI is unavailable).
 */

export class AiUnavailableError extends Error {}

export { aiSpendUsd } from '@udyaibase/database/ops';

export async function recordAiCall(c: { feature: string; model: string; promptTokens?: number; completionTokens?: number; ok: boolean; error?: string }) {
  const promptTokens = c.promptTokens ?? 0, completionTokens = c.completionTokens ?? 0;
  await prisma.opsAiCall.create({
    data: { feature: c.feature, model: c.model, promptTokens, completionTokens, costMicroUsd: aiCostMicroUsd(c.model, promptTokens, completionTokens), ok: c.ok, error: c.error?.slice(0, 300) },
  }).catch(() => {});
  if (c.ok) await checkAiBudget().catch(() => {});
}

export async function checkAiBudget() {
  const { dailyUsd, monthlyUsd } = aiBudgets();
  const spend = await aiSpendUsd();
  const usd = (n: number) => `$${n.toFixed(2)}`;
  if (spend.today >= dailyUsd * 0.8) {
    await opsAlert('ai-budget-day', `OpenAI spend today is ${usd(spend.today)} of the ${usd(dailyUsd)} daily budget`, [
      `This month so far: ${usd(spend.month)} of ${usd(monthlyUsd)}.`,
      process.env.OPENAI_HARD_STOP === 'true' ? 'Hard stop is on: AI features pause when the budget is used up.' : 'Hard stop is off: AI features keep running past the budget.',
      'Budgets: OPENAI_DAILY_BUDGET_USD / OPENAI_MONTHLY_BUDGET_USD.',
    ], 12);
  }
  if (spend.month >= monthlyUsd * 0.8) {
    await opsAlert('ai-budget-month', `OpenAI spend this month is ${usd(spend.month)} of the ${usd(monthlyUsd)} monthly budget`, [`Today: ${usd(spend.today)}.`], 24);
  }
  return spend;
}

async function overBudget() {
  if (process.env.OPENAI_HARD_STOP !== 'true') return false;
  const { dailyUsd, monthlyUsd } = aiBudgets();
  const s = await aiSpendUsd();
  return s.today >= dailyUsd || s.month >= monthlyUsd;
}

/** POST /v1/chat/completions with monitoring. Throws AiUnavailableError (no key / over budget) or Error (API failure). */
export async function openaiChat(feature: string, body: { model: string; [k: string]: unknown }, timeoutMs = 30_000): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiUnavailableError('OPENAI_API_KEY is not set');
  if (await overBudget()) {
    await opsAlert('ai-hard-stop', 'AI features paused: OpenAI budget used up', ['OPENAI_HARD_STOP is on. Raise the budget or turn hard stop off to resume.'], 12);
    throw new AiUnavailableError('AI budget used up');
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(`openai ${res.status}${detail?.error?.code ? ` ${detail.error.code}` : ''}`);
    }
    const data = await res.json();
    await recordAiCall({ feature, model: body.model, promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens, ok: true });
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAiCall({ feature, model: body.model, ok: false, error: message });
    // 401/429 quota problems stop every AI feature at once: tell the admins straight away.
    if (/openai (401|429)/.test(message)) {
      await opsAlert(`ai-api-${message.includes('401') ? 'auth' : 'quota'}`, message.includes('401') ? 'OpenAI rejected the API key' : 'OpenAI rate limit or quota reached', [`Feature: ${feature}`, `Error: ${message}`]);
    }
    throw err;
  }
}

/** Failure rate over the last 24 hours (alerts at 20% with at least 10 calls). */
export async function checkAiFailures() {
  const since = new Date(Date.now() - 864e5);
  const [total, failed] = await Promise.all([
    prisma.opsAiCall.count({ where: { createdAt: { gte: since } } }),
    prisma.opsAiCall.count({ where: { createdAt: { gte: since }, ok: false } }),
  ]);
  if (total >= 10 && failed / total >= 0.2) {
    const recent = await prisma.opsAiCall.findMany({ where: { createdAt: { gte: since }, ok: false }, orderBy: { createdAt: 'desc' }, take: 3, select: { feature: true, error: true } });
    await opsAlert('ai-failures', `${failed} of ${total} OpenAI calls failed in the last 24 hours`, recent.map((r) => `${r.feature}: ${r.error}`));
  }
  return { total, failed };
}

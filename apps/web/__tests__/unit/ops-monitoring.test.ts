import { describe, it, expect, afterEach, vi } from 'vitest';
import { aiCostMicroUsd, aiBudgets } from '@udyaibase/utils/ai-cost';
import { isQuotaError } from '@/lib/email/quota';

describe('OpenAI cost estimate', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('prices per model; dated model names match their family; unknown models price high', () => {
    expect(aiCostMicroUsd('gpt-4o-mini', 1_000_000, 0)).toBe(150_000);          // $0.15
    expect(aiCostMicroUsd('gpt-4o-mini-2024-07-18', 0, 1_000_000)).toBe(600_000); // $0.60
    expect(aiCostMicroUsd('gpt-4o', 1000, 1000)).toBe(12_500);                    // $0.0125
    expect(aiCostMicroUsd('some-new-model', 1000, 1000)).toBe(12_500);
  });
  it('budgets default to $5/day and $50/month, env overridable, junk ignored', () => {
    expect(aiBudgets()).toEqual({ dailyUsd: 5, monthlyUsd: 50 });
    vi.stubEnv('OPENAI_DAILY_BUDGET_USD', '2.5'); vi.stubEnv('OPENAI_MONTHLY_BUDGET_USD', 'lots');
    expect(aiBudgets()).toEqual({ dailyUsd: 2.5, monthlyUsd: 50 });
  });
});

describe('Resend quota errors', () => {
  it('recognises limit and rate errors only', () => {
    expect(isQuotaError('You have reached your daily email sending quota')).toBe(true);
    expect(isQuotaError('Too many requests. You can only make 2 requests per second.')).toBe(true);
    expect(isQuotaError('monthly_quota_exceeded')).toBe(true);
    expect(isQuotaError('Invalid `to` field')).toBe(false);
  });
});

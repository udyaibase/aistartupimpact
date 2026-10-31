import { checkMissedCrons } from '@/lib/ops/cron';
import { checkEmailUsage } from '@/lib/ops/email';
import { checkAiBudget, checkAiFailures } from '@/lib/ops/ai';

/** Health checks run after every scheduled job; each alert is throttled on its own. */
export async function runOpsChecks() {
  const [missed, email, ai, spend] = await Promise.all([checkMissedCrons(), checkEmailUsage(), checkAiFailures(), checkAiBudget()]);
  return { missedJobs: missed.length, emailsSent24h: email.sent24h, aiCalls24h: ai.total, aiSpendTodayUsd: spend.today };
}

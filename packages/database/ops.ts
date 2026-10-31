import { prisma } from './index';

/**
 * Monitoring queries shared by the web app (alerts) and the admin app (Monitoring page),
 * so both always show the same numbers.
 */

/** Scheduled jobs (apps/web/vercel.json) and how long after the last successful run they count as missed. */
export const CRON_JOBS: Record<string, { label: string; maxGapHours: number }> = {
  'data-retention': { label: 'Data retention and plan maintenance (daily)', maxGapHours: 26 },
  'daily-digest': { label: 'Admin daily digest (daily)', maxGapHours: 26 },
  'india-ai-stats': { label: 'India AI stats refresh (every 6 hours)', maxGapHours: 8 },
};

/** Resend plan limits from env: RESEND_DAILY_LIMIT (default 100, the free plan) and RESEND_MONTHLY_LIMIT (default 3000). */
export function emailLimits() {
  const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);
  return { daily: num(process.env.RESEND_DAILY_LIMIT, 100), monthly: num(process.env.RESEND_MONTHLY_LIMIT, 3000) };
}

/**
 * Emails sent: the EmailLog (every individual send from both apps, including host promo batches)
 * plus batch sends it doesn't see: admin newsletters (campaign totals) and admin event campaigns (recipients).
 */
export async function emailUsage(now = new Date()) {
  const day = new Date(now.getTime() - 864e5);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const campaignSent = async (since: Date) => {
    const [n, ev] = await Promise.all([
      prisma.$queryRaw<{ n: number }[]>`SELECT COALESCE(SUM("totalSent"), 0)::int AS n FROM "NewsletterCampaign" WHERE "sentAt" >= ${since}`.catch(() => [{ n: 0 }]),
      prisma.eventCampaignRecipient.count({ where: { sentAt: { gte: since }, campaign: { creditSource: 'ADMIN' } } }).catch(() => 0),
    ]);
    return (n[0]?.n ?? 0) + ev;
  };
  const [sent24h, failed24h, sentMonth, campaign24h, campaignMonth] = await Promise.all([
    prisma.emailLog.count({ where: { sentAt: { gte: day }, status: 'sent' } }),
    prisma.emailLog.count({ where: { sentAt: { gte: day }, status: 'failed' } }),
    prisma.emailLog.count({ where: { sentAt: { gte: month }, status: 'sent' } }),
    campaignSent(day),
    campaignSent(month),
  ]);
  return { sent24h: sent24h + campaign24h, failed24h, sentMonth: sentMonth + campaignMonth, limits: emailLimits() };
}

/** Estimated OpenAI spend (USD) today and this month, UTC. */
export async function aiSpendUsd(now = new Date()) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [d, m] = await Promise.all([
    prisma.opsAiCall.aggregate({ where: { createdAt: { gte: day } }, _sum: { costMicroUsd: true } }),
    prisma.opsAiCall.aggregate({ where: { createdAt: { gte: month } }, _sum: { costMicroUsd: true } }),
  ]);
  return { today: (d._sum.costMicroUsd ?? 0) / 1e6, month: (m._sum.costMicroUsd ?? 0) / 1e6 };
}

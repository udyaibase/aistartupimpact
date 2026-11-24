'use server';

import { prisma } from '@udyaibase/database';
import { CRON_JOBS, aiSpendUsd, emailUsage } from '@udyaibase/database/ops';
import { aiBudgets } from '@udyaibase/utils/ai-cost';
import { requireActionAuth } from '@/lib/api-auth';

/** Scheduled jobs, email usage against the Resend plan, and OpenAI spend and failures. Super admins only. */
export async function monitoringAction() {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false as const, error };
  const now = new Date();
  const week = new Date(now.getTime() - 7 * 864e5);
  const day = new Date(now.getTime() - 864e5);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const jobs = await Promise.all(Object.entries(CRON_JOBS).map(async ([job, cfg]) => {
    const [last, lastOk, failed7d] = await Promise.all([
      prisma.opsCronRun.findFirst({ where: { job }, orderBy: { startedAt: 'desc' }, select: { startedAt: true, ok: true, error: true } }),
      prisma.opsCronRun.findFirst({ where: { job, ok: true }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
      prisma.opsCronRun.count({ where: { job, ok: false, startedAt: { gte: week } } }),
    ]);
    const gapH = lastOk ? (now.getTime() - lastOk.startedAt.getTime()) / 36e5 : null;
    return {
      job, label: cfg.label,
      lastRunAt: last?.startedAt.toISOString() ?? null, lastOk: last?.ok ?? null, lastError: last?.ok === false ? last.error : null,
      lastSuccessAt: lastOk?.startedAt.toISOString() ?? null, failed7d,
      overdue: gapH != null && gapH > cfg.maxGapHours,
    };
  }));

  const [email, spend, byFeature, ai24, aiFailed24, recentFailures, alerts] = await Promise.all([
    emailUsage(now),
    aiSpendUsd(now),
    prisma.opsAiCall.groupBy({ by: ['feature'], where: { createdAt: { gte: month } }, _sum: { costMicroUsd: true }, _count: { _all: true }, orderBy: { _sum: { costMicroUsd: 'desc' } } }),
    prisma.opsAiCall.count({ where: { createdAt: { gte: day } } }),
    prisma.opsAiCall.count({ where: { createdAt: { gte: day }, ok: false } }),
    prisma.opsAiCall.findMany({ where: { ok: false, createdAt: { gte: week } }, orderBy: { createdAt: 'desc' }, take: 5, select: { feature: true, error: true, createdAt: true } }),
    prisma.opsAlert.findMany({ orderBy: { lastSentAt: 'desc' }, take: 10 }),
  ]);

  // AI reviews per company this month. Calls aren't tagged with a company, so each company's cost is its share of
  // this month's review spend (reviews + the resume profiles they build), by number of reviews.
  const [reviewsBy, reviewSpend] = await Promise.all([
    prisma.jobBoardAiScreening.groupBy({ by: ['employerId'], where: { createdAt: { gte: month }, status: 'DONE' }, _count: { _all: true }, orderBy: { _count: { employerId: 'desc' } }, take: 15 }),
    prisma.opsAiCall.aggregate({ where: { createdAt: { gte: month }, feature: { in: ['ai_screening', 'resume_profile'] } }, _sum: { costMicroUsd: true } }),
  ]);
  const totalReviews = await prisma.jobBoardAiScreening.count({ where: { createdAt: { gte: month }, status: 'DONE' } });
  const names = new Map((await prisma.jobBoardEmployer.findMany({ where: { id: { in: reviewsBy.map((r) => r.employerId) } }, select: { id: true, companyName: true, plan: true } })).map((e) => [e.id, e]));
  const perReviewUsd = totalReviews ? (reviewSpend._sum.costMicroUsd ?? 0) / 1e6 / totalReviews : 0;
  const daysIn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate() - 1 + now.getUTCHours() / 24;

  return {
    success: true as const,
    jobs,
    email,
    ai: {
      ...spend, budgets: aiBudgets(), hardStop: process.env.OPENAI_HARD_STOP === 'true',
      calls24h: ai24, failed24h: aiFailed24,
      // Straight-line forecast from the month so far (not shown in the first day: too little to go on).
      forecastMonthUsd: dayOfMonth >= 1 ? (spend.month / dayOfMonth) * daysIn : null,
      reviews: {
        total: totalReviews, perReviewUsd,
        byCompany: reviewsBy.map((r) => ({ id: r.employerId, name: names.get(r.employerId)?.companyName ?? 'Deleted company', plan: names.get(r.employerId)?.plan ?? '', reviews: r._count._all, usd: r._count._all * perReviewUsd })),
      },
      byFeature: byFeature.map((f) => ({ feature: f.feature, calls: f._count._all, usd: (f._sum.costMicroUsd ?? 0) / 1e6 })),
      recentFailures: recentFailures.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
    },
    alerts: alerts.map((a) => ({ key: a.key, lastSentAt: a.lastSentAt.toISOString(), count: a.count })),
  };
}

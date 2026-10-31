import { prisma } from '@udyaibase/database';
import { CRON_JOBS } from '@udyaibase/database/ops';
import { opsAlert } from '@/lib/ops/alert';

export { CRON_JOBS } from '@udyaibase/database/ops';

/** Jobs whose last successful run is older than allowed (or that never succeeded since monitoring started). */
export async function checkMissedCrons(now = new Date()) {
  const missed: string[] = [];
  for (const [job, cfg] of Object.entries(CRON_JOBS)) {
    const [last, first] = await Promise.all([
      prisma.opsCronRun.findFirst({ where: { job, ok: true }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
      prisma.opsCronRun.findFirst({ orderBy: { startedAt: 'asc' }, select: { startedAt: true } }),
    ]);
    // Don't call a job missed before monitoring has been running long enough to see it.
    const since = last?.startedAt ?? first?.startedAt;
    if (!since) continue;
    const gapH = (now.getTime() - since.getTime()) / 36e5;
    if (gapH > cfg.maxGapHours) missed.push(`${cfg.label}: no successful run for ${Math.round(gapH)} hours`);
  }
  if (missed.length) await opsAlert('cron-missed', `${missed.length} scheduled job${missed.length === 1 ? '' : 's'} not running`, [...missed, 'Check Vercel → Cron Jobs, and that CRON_SECRET is set.']);
  return missed;
}

/**
 * For cron routes that already catch their own errors: records the run from the response status
 * (5xx or a thrown error = failed and alerted). Unauthorized calls (401) aren't runs and aren't recorded.
 * Every recorded run also runs the shared health checks (missed jobs, email limits, AI spend).
 */
export async function trackCronRoute(job: keyof typeof CRON_JOBS, handler: () => Promise<Response>): Promise<Response> {
  const started = new Date();
  let res: Response;
  try {
    res = await handler();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.opsCronRun.create({ data: { job, startedAt: started, finishedAt: new Date(), ok: false, error: message.slice(0, 1000) } }).catch(() => {});
    await opsAlert(`cron-failed:${job}`, `Scheduled job failed: ${CRON_JOBS[job].label}`, [`Error: ${message.slice(0, 300)}`]).catch(() => {});
    throw err;
  }
  if (res.status === 401) return res;
  const ok = res.status < 500;
  const body = await res.clone().json().catch(() => null);
  await prisma.opsCronRun.create({
    data: { job, startedAt: started, finishedAt: new Date(), ok, error: ok ? null : String(body?.error ?? `HTTP ${res.status}`).slice(0, 1000), summary: body ?? undefined },
  }).catch(() => {});
  if (!ok) {
    await opsAlert(`cron-failed:${job}`, `Scheduled job failed: ${CRON_JOBS[job].label}`, [`HTTP ${res.status}: ${String(body?.error ?? 'no details')}`, `Time: ${new Date().toISOString()}`]).catch(() => {});
  }
  const { runOpsChecks } = await import('@/lib/ops/checks');
  await runOpsChecks().catch((e) => console.error('[ops checks]', e));
  return res;
}

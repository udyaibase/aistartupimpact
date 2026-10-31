import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { screenApplication } from '@/lib/jobs/ai-screen';
import { planStatus } from '@/lib/employer/billing';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH = 20;
const CONCURRENCY = 4;

/**
 * Run AI screening on specific candidates (`ids`, `force` to re-run) or on the next batch of
 * unscreened candidates (optionally for one job). The client calls again while `remaining` > 0.
 */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'candidates.move')) return forbidden();

  const { success } = await checkRateLimit(apiRateLimit, `ai-screen:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const force = body.force === true;
  const jobId = typeof body.jobId === 'string' ? body.jobId : undefined;
  const unscreened = {
    Listing: { employerId: session.id, ...(jobId ? { id: jobId } : {}) },
    withdrawnAt: null, status: { not: 'REJECTED' as const },
    OR: [{ AiScreening: { is: null } }, { AiScreening: { is: { status: 'FAILED' as const } } }],
  };

  let ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, BATCH) : [];
  if (!ids.length) {
    ids = (await prisma.jobBoardApplication.findMany({ where: unscreened, orderBy: { appliedAt: 'desc' }, take: BATCH, select: { id: true } })).map((a) => a.id);
  }

  const tally = { done: 0, cached: 0, failed: 0 };
  let stop: { code: string; message: string } | null = null;
  const queue = [...ids];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && !stop) {
      const id = queue.shift()!;
      const r = await screenApplication(id, session.id, { force });
      if (r.ok) tally[r.status]++;
      else if (r.code === 'plan' || r.code === 'quota' || r.code === 'not_configured') stop = { code: r.code, message: r.message };
      else tally.failed++;
    }
  }));

  const [remaining, status, rows] = await Promise.all([
    Array.isArray(body.ids) && body.ids.length ? 0 : prisma.jobBoardApplication.count({ where: unscreened }),
    planStatus(session.id),
    prisma.jobBoardAiScreening.findMany({ where: { applicationId: { in: ids }, employerId: session.id }, select: { applicationId: true, status: true, fitScore: true, recommendation: true } }),
  ]);
  const results = Object.fromEntries(rows.map((r) => [r.applicationId, { status: r.status, fitScore: r.fitScore, recommendation: r.recommendation }]));
  if (stop && !tally.done && !tally.cached) {
    return NextResponse.json({ error: (stop as { message: string }).message, code: (stop as { code: string }).code, ai: status?.ai }, { status: 402 });
  }
  return NextResponse.json({ ...tally, remaining: stop ? 0 : remaining, ai: status?.ai, stopped: stop, results });
}

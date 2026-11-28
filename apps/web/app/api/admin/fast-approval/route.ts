import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runFastApproval } from '@/lib/listings/fast-approval';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Scheduled job: schedules and publishes fast approvals of startups and AI tools (see lib/listings/fast-approval). */
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, ...(await runFastApproval()) });
  } catch (err) {
    console.error('[fast-approval]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return trackCronRoute('fast-approval', () => run(request), { checks: false });
}

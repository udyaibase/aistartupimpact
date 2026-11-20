import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runJobAlerts } from '@/lib/jobs/job-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Monday 10:00 IST (04:30 UTC): weekly emails of new jobs for confirmed site-visitor alerts. */
export async function GET(request: NextRequest) {
  return trackCronRoute('job-alerts', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, results: await runJobAlerts(new Date()) });
  });
}

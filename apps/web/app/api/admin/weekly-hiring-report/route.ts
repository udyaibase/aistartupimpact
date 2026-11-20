import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runWeeklyReports } from '@/lib/employer/weekly-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Monday 9:00 IST (03:30 UTC): the weekly hiring report to each workspace's owners and recruiters. */
export async function GET(request: NextRequest) {
  return trackCronRoute('weekly-hiring-report', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const results = await runWeeklyReports(new Date());
    return NextResponse.json({ success: true, results });
  });
}

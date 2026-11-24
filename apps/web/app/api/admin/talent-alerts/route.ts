import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runTalentAlerts } from '@/lib/employer/talent-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily 09:00 IST (03:30 UTC): emails about new talent pool members who match an employer's saved searches. */
export async function GET(request: NextRequest) {
  return trackCronRoute('talent-alerts', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, results: await runTalentAlerts(new Date()) });
  });
}

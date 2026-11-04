import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runFounderEngagement } from '@/lib/founder/engagement-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily, at 10:00 India time. Sends nothing unless FOUNDER_ENGAGEMENT_EMAILS is "on"; until then it only reports. */
export async function GET(request: NextRequest) {
  return trackCronRoute('founder-engagement', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, ...(await runFounderEngagement()) });
  });
}

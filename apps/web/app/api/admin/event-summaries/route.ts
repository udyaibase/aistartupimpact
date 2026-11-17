import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runEventSummaries } from '@/lib/events/event-summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily, 10:00 India time: "how your event went" emails to hosts whose event ended yesterday. */
export async function GET(request: NextRequest) {
  return trackCronRoute('event-summaries', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, ...(await runEventSummaries()) });
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runAutoFollowUps } from '@/lib/events/follow-ups';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Every 15 minutes: send follow-ups that hosts set to go out automatically 2 hours after their event ends. */
export async function GET(request: NextRequest) {
  return trackCronRoute('event-follow-ups', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, ...(await runAutoFollowUps()) });
  }, { checks: false });
}

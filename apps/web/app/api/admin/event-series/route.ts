import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { announceNewEditions, generateRecurringDrafts } from '@/lib/events/series';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hourly: email series followers about newly published events, and create drafts for repeating series. */
export async function GET(request: NextRequest) {
  return trackCronRoute('event-series', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const announced = await announceNewEditions();
    const drafts = await generateRecurringDrafts();
    return NextResponse.json({ success: true, announced, drafts });
  });
}

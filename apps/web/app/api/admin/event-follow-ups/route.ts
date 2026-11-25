import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runAutoFollowUps } from '@/lib/events/follow-ups';
import { runScheduledCertificates } from '@/lib/events/certificates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Every 15 minutes: issue certificates hosts scheduled for when their event ends, then send follow-ups set to go out
 * automatically 2 hours after the end (certificates first, so the thank-you email can link to them).
 */
export async function GET(request: NextRequest) {
  return trackCronRoute('event-follow-ups', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const certificates = await runScheduledCertificates();
    return NextResponse.json({ success: true, certificates, ...(await runAutoFollowUps()) });
  }, { checks: false });
}

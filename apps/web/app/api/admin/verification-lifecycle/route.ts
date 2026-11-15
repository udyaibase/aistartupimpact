import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runVerificationLifecycle } from '@/lib/startups/verification-lifecycle';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily, 09:00 India time: re-check DNS records, send expiry reminders, and remove lapsed verified ticks. */
export async function GET(request: NextRequest) {
  return trackCronRoute('verification-lifecycle', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, ...(await runVerificationLifecycle()) });
  });
}

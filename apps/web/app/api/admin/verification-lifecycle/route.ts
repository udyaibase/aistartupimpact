import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runVerificationLifecycle } from '@/lib/startups/verification-lifecycle';
import { remindFounders } from '@/lib/employer/company-check';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily, 09:00 India time: re-check DNS records, send expiry reminders, and remove lapsed verified ticks. Also the one
 * reminder to founders a hiring team asked to verify their startup more than a day ago.
 */
export async function GET(request: NextRequest) {
  return trackCronRoute('verification-lifecycle', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const lifecycle = await runVerificationLifecycle();
    const founderReminders = await remindFounders().catch((e) => { console.error('[verification-lifecycle] founder reminders', e instanceof Error ? e.message : e); return -1; });
    return NextResponse.json({ success: true, ...lifecycle, founderReminders });
  });
}

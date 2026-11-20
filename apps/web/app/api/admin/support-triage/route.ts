import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { sendTriageDigest } from '@/lib/support/triage';

export const dynamic = 'force-dynamic';

/** Mon–Sat 10:00 and 16:00 IST (04:30 and 10:30 UTC): the support triage digest to the support inbox. */
export async function GET(request: NextRequest) {
  return trackCronRoute('support-triage', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, ...(await sendTriageDigest()) });
  });
}

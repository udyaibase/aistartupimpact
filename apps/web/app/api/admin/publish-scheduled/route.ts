import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { publishScheduledArticles } from '@/lib/articles/schedule';

export const dynamic = 'force-dynamic';

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, ...(await publishScheduledArticles()) });
  } catch (err) {
    console.error('[publish-scheduled]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return trackCronRoute('publish-scheduled', () => run(request), { checks: false });
}

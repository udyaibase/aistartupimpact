import { NextRequest, NextResponse } from 'next/server';
import { unsubscribeCareers } from '@/lib/jobs/careers-subscribers';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';

export const dynamic = 'force-dynamic';

/** One-click unsubscribe (RFC 8058) from the List-Unsubscribe header of "now hiring" emails. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(applicationStatusRateLimit, `notify-unsub:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false }, { status: 429 });
  const r = await unsubscribeCareers(request.nextUrl.searchParams.get('t') ?? '');
  return NextResponse.json({ success: r.ok }, { status: r.ok ? 200 : 404 });
}

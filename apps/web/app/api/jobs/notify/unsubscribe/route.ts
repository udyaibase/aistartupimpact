import { NextRequest, NextResponse } from 'next/server';
import { unsubscribeCareers } from '@/lib/jobs/careers-subscribers';

export const dynamic = 'force-dynamic';

/** One-click unsubscribe (RFC 8058) from the List-Unsubscribe header of "now hiring" emails. */
export async function POST(request: NextRequest) {
  const r = await unsubscribeCareers(request.nextUrl.searchParams.get('t') ?? '');
  return NextResponse.json({ success: r.ok }, { status: r.ok ? 200 : 404 });
}

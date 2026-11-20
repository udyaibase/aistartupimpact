import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { unsubscribeJobAlert } from '@/lib/jobs/job-alerts';

export const dynamic = 'force-dynamic';

/** One-click unsubscribe (List-Unsubscribe-Post) for a weekly job alert. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(applicationStatusRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const r = await unsubscribeJobAlert(request.nextUrl.searchParams.get('t') ?? '');
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
}

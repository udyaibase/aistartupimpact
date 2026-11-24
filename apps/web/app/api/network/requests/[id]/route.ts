import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { getCandidate } from '@/lib/jobs/candidate-account';
import { respondToIntro } from '@/lib/network/profile';

export const dynamic = 'force-dynamic';

/** Accept, decline or report a company's request. Only the person it was sent to, signed in. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const me = await getCandidate();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { success } = await checkRateLimit(applicationStatusRateLimit, `network:${me.id}:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { id } = await props.params;
  const body = await req.json().catch(() => ({}));
  const r = await respondToIntro(me.id, id, body.action, body.reason);
  return r.ok ? NextResponse.json({ success: true, status: r.status, applyUrl: r.applyUrl }) : NextResponse.json({ error: r.error }, { status: r.status });
}

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { getCandidate } from '@/lib/jobs/candidate-account';
import { setBlocked } from '@/lib/network/profile';

export const dynamic = 'force-dynamic';

/** Hide my profile from a company, or show it again. */
export async function POST(req: NextRequest) {
  const me = await getCandidate();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { success } = await checkRateLimit(applicationStatusRateLimit, `network:${me.id}:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const employerId = typeof body.employerId === 'string' ? body.employerId.slice(0, 64) : '';
  if (!employerId) return NextResponse.json({ error: 'Choose a company.' }, { status: 400 });
  return (await setBlocked(me.id, employerId, body.blocked !== false))
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Couldn’t change this.' }, { status: 400 });
}

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { getCandidate } from '@/lib/jobs/candidate-account';
import { leaveNetwork, renewProfile, saveOpenProfile, setPaused } from '@/lib/network/profile';

export const dynamic = 'force-dynamic';

/** The signed-in job seeker's "Open to opportunities" profile: turn on / save, pause, resume, renew, leave. */
export async function POST(req: NextRequest) {
  const me = await getCandidate();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { success } = await checkRateLimit(applicationStatusRateLimit, `network:${me.id}:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  switch (body.action) {
    case 'save': {
      const r = await saveOpenProfile(me, body.profile, { consent: body.consent === true });
      return r.ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: r.error, field: r.field }, { status: r.status });
    }
    case 'pause':
    case 'resume':
      return (await setPaused(me.id, body.action === 'pause')) ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Nothing to change.' }, { status: 404 });
    case 'renew':
      return (await renewProfile(me.id)) ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Nothing to renew.' }, { status: 404 });
    case 'leave':
      await leaveNetwork(me.id);
      return NextResponse.json({ success: true });
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { employerApi } from '@/lib/employer/api-session';
import { requestIntro } from '@/lib/network/intros';

export const dynamic = 'force-dynamic';

/** Ask someone on the network to apply for one of your open jobs (pilot companies; people who can move candidates). */
export async function POST(request: NextRequest) {
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  if (session.jobIds) return NextResponse.json({ error: 'Not available for your role.' }, { status: 403 });
  const { success } = await checkRateLimit(apiRateLimit, `network-request:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many requests at once. Try again in a minute.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const r = await requestIntro({ employerId: session.id, sentByEmail: session.email, profileId: body.profileId, listingId: body.listingId, message: body.message });
  return r.ok ? NextResponse.json({ success: true, id: r.id, left: r.left }) : NextResponse.json({ error: r.error }, { status: r.status });
}

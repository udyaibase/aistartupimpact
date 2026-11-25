import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { seriesJoinTarget, verifySeriesJoinToken } from '@/lib/events/after-event';
import { authRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Follow a series from the link in a follow-up email. The link was sent to the registration's own address, so the
 * address is already confirmed: the follow is confirmed straight away (no second email).
 */
export async function POST(request: NextRequest) {
  const { success, reset } = await checkRateLimit(authRateLimit, `series-join:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  const body = await request.json().catch(() => ({}));
  const regId = verifySeriesJoinToken(body?.t);
  if (!regId) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  const target = await seriesJoinTarget(regId);
  if (!target) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  const { email } = target;
  const seriesId = target.series.id;
  await prisma.eventSeriesFollower.upsert({
    where: { seriesId_email: { seriesId, email } },
    create: { seriesId, email, confirmedAt: new Date() },
    update: { confirmedAt: new Date(), unsubscribedAt: null },
  });
  return NextResponse.json({ success: true });
}

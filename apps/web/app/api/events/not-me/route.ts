import { NextRequest, NextResponse } from 'next/server';
import { verifyNotMeToken } from '@/lib/events/after-event';
import { reportNotMe } from '@/lib/events/registration-trust';
import { apiRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * "I didn't register": cancels the one registration the signed link names and blocks that address from guest
 * registration for a while. Only a POST from the confirmation page does it, so a mail scanner opening the link
 * changes nothing.
 */
export async function POST(request: NextRequest) {
  const { success, reset } = await checkRateLimit(apiRateLimit, `not-me:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  const body = await request.json().catch(() => ({}));
  const registrationId = verifyNotMeToken(body?.t);
  if (!registrationId) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });

  const result = await reportNotMe(registrationId);
  if (result === 'missing') return NextResponse.json({ success: false, error: 'This registration no longer exists.' }, { status: 404 });
  if (result === 'paid' || result === 'attended') {
    return NextResponse.json({ success: false, code: result, error: result === 'paid' ? 'This ticket was paid for, so we can’t cancel it here. Contact support and we’ll sort it out.' : 'This ticket was used at the event, so we can’t cancel it here. Contact support.' }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}

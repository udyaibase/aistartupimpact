import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { verifySpeakerPortalToken } from '@/lib/events/after-event';
import { putEventImage } from '@/lib/media/event-image';
import { apiRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Speaker photo upload from the portal (multipart: t, file). Returns the URL; saving it is a separate step. */
export async function POST(request: NextRequest) {
  const { success, reset } = await checkRateLimit(apiRateLimit, `speaker-photo:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  const form = await request.formData().catch(() => null);
  const speakerId = verifySpeakerPortalToken(form?.get('t'));
  if (!speakerId) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  const sp = await prisma.eventSpeaker.findUnique({ where: { id: speakerId }, select: { eventId: true } });
  if (!sp) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  const r = await putEventImage(form?.get('file') as File | null, `events/speakers/${sp.eventId}`);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, url: r.url });
}

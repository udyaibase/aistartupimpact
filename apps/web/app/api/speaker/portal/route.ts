import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { speakerLinkOpen, verifySpeakerPortalToken } from '@/lib/events/after-event';
import { cleanHttpsUrl } from '@/lib/events/recap';
import { isOwnMediaUrl } from '@/lib/events/certificate-pdf';
import { apiRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { refreshPaths } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

/** A speaker updates their own details from the link in their acceptance email. */
export async function POST(request: NextRequest) {
  const { success, reset } = await checkRateLimit(apiRateLimit, `speaker-portal:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  const body = await request.json().catch(() => ({}));
  const speakerId = verifySpeakerPortalToken(body?.t);
  if (!speakerId) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  const sp = await prisma.eventSpeaker.findUnique({ where: { id: speakerId }, select: { id: true, event: { select: { slug: true, deletedAt: true, endAt: true } } } });
  if (!sp || sp.event.deletedAt) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  if (!speakerLinkOpen(sp.event)) return NextResponse.json({ success: false, error: 'This link has expired. Ask the host if something needs changing.' }, { status: 410 });
  const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const name = clip(body.name, 100);
  if (name.length < 2) return NextResponse.json({ success: false, error: 'Add your name.', field: 'name' }, { status: 400 });
  await prisma.eventSpeaker.update({
    where: { id: sp.id },
    data: {
      name, title: clip(body.title, 100) || null, company: clip(body.company, 100) || null,
      talkTitle: clip(body.talkTitle, 200) || null,
      bio: cleanHttpsUrl(body.linkedinUrl),
      slidesUrl: cleanHttpsUrl(body.slidesUrl),
      ...(body.headshotUrl === null ? { headshotUrl: null } : isOwnMediaUrl(body.headshotUrl) ? { headshotUrl: body.headshotUrl } : {}),
    },
  });
  refreshPaths([`/events/${sp.event.slug}`]);
  return NextResponse.json({ success: true });
}

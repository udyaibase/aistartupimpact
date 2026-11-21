import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { certificateSettings, CERTIFICATE_PHRASES } from '@/lib/events/after-event';
import { renderCertificatePdf } from '@/lib/events/certificate-pdf';
import { eventDateText, eventPlaceText, verifyUrl } from '@/lib/events/certificates';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** A sample certificate with the current (or proposed, via ?settings=) design, so hosts can see it before paying or issuing. */
export async function GET(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.view');
  if (access instanceof NextResponse) return access;
  const { event, session } = access;
  const { success, reset } = await checkRateLimit(apiRateLimit, `certificate-preview:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  let proposed: unknown = event.certificateSettings;
  const raw = request.nextUrl.searchParams.get('settings');
  if (raw && raw.length < 3000) {
    try {
      const typed = JSON.parse(raw);
      // A pasted design is too long for an address, so the form leaves it out and the saved one is used.
      const saved = (event.certificateSettings && typeof event.certificateSettings === 'object' ? event.certificateSettings : {}) as Record<string, unknown>;
      proposed = typed && typeof typed === 'object' && typeof typed.customSvg !== 'string' ? { ...typed, customSvg: saved.customSvg } : typed;
    } catch { /* use saved */ }
  }
  const s = certificateSettings(proposed);
  const full = await prisma.event.findUnique({
    where: { id: event.id },
    select: { format: true, venueName: true, address: true, organizer: { select: { name: true, company: true, avatar: true } } },
  });
  const hostName = full?.organizer.company || full?.organizer.name || 'Host';
  const pdf = await renderCertificatePdf({
    template: s.template, title: s.title, recipientName: 'Your Attendee Name', eventTitle: event.title,
    dateLine: [eventDateText(event.startAt, event.endAt, event.timezone), full ? eventPlaceText(full) : '', s.duration].filter(Boolean).join(' · '),
    phrase: CERTIFICATE_PHRASES[s.phrase], description: s.description, skills: s.skills,
    hostName, logoUrl: s.logoUrl ?? full?.organizer.avatar ?? null,
    partnerLogoUrl: s.partnerLogoUrl, logoPosition: s.logoPosition, logoSize: s.logoSize, showHostName: s.showHostName, customSvg: s.customSvg, duration: s.duration, signerName: s.signerName, signerTitle: s.signerTitle, signatureUrl: s.signatureUrl,
    code: 'SAMPLE0000000000', verifyUrl: verifyUrl('SAMPLE'), showBranding: false,
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="certificate-sample.pdf"', 'Cache-Control': 'no-store' },
  });
}

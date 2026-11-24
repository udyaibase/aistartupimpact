import { NextRequest, NextResponse } from 'next/server';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { badgeContext } from '@/lib/events/badge-design';
import { renderBadgePreviewSvg, isBadgeLayout, type BadgeLayout, type BadgePerson } from '@/lib/events/badges';
import { eventDateText } from '@/lib/events/certificates';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * One sample badge (an SVG image, drawn by the same code as the PDF) in the saved design, or a proposed one
 * (?settings=). Free hosts can preview the Pro options too,
 * to see what they would get; only saving them needs Pro.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.view');
  if (access instanceof NextResponse) return access;
  const { event, session } = access;
  const { success, reset } = await checkRateLimit(apiRateLimit, `badge-preview:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  const q = request.nextUrl.searchParams;
  let proposed: unknown;
  const raw = q.get('settings');
  if (raw && raw.length < 4000) { try { proposed = JSON.parse(raw); } catch { /* the saved design */ } }
  const saved = await badgeContext(event.id);
  if (!saved) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
  // A design is too long for the address: the page leaves it out, and the saved one is used.
  if (proposed && typeof proposed === 'object' && typeof (proposed as { customSvg?: unknown }).customSvg !== 'string') {
    proposed = { ...(proposed as object), customSvg: saved.settings.customSvg };
  }
  // Preview as Pro, so a Free host sees the custom options they're trying out.
  const ctx = proposed === undefined ? saved : await badgeContext(event.id, proposed).then((c) => c && (c.pro ? c : null));
  const design = ctx?.design ?? (await previewAsPro(event.id, proposed));

  const firstTier = saved.tiers[0];
  const sample: BadgePerson = {
    name: 'Priya Sharma', company: 'Your Startup', occupation: 'Founder', tier: firstTier?.name ?? 'General', tierId: firstTier?.id ?? null,
    qrToken: 'SAMPLE-BADGE', answers: Object.fromEntries(saved.questions.slice(0, 2).map((x) => [x.id, 'Sample answer'])),
  };
  const layout = isBadgeLayout(q.get('layout')) ? q.get('layout') as BadgeLayout : 'a6';
  const svg = await renderBadgePreviewSvg({
    eventTitle: event.title, eventDate: eventDateText(event.startAt, event.endAt, event.timezone),
    layout, person: sample, design,
  });
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'" },
  });
}

/** The proposed design with the Pro options kept, for a Free host's preview only (never saved). */
async function previewAsPro(eventId: string, proposed: unknown) {
  const { cleanBadgeSettings } = await import('@/lib/events/badge-settings');
  const { isOwnMediaUrl } = await import('@/lib/events/urls');
  const base = await badgeContext(eventId);
  const settings = cleanBadgeSettings(proposed, { pro: true, isOwnMedia: isOwnMediaUrl });
  const labels = Object.fromEntries((base?.questions ?? []).filter((x) => settings.questionIds.includes(x.id)).map((x) => [x.id, x.label]));
  return { ...base!.design, settings, questionLabels: labels };
}

import { sanitizeCustomSvg } from '@/lib/events/certificate-custom-server';
import { checkCustomSvg } from '@/lib/events/certificate-custom';
import { isOwnMediaUrl } from '@/lib/events/urls';
import { eventDateText, eventPlaceText } from '@/lib/events/certificates';
import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import {
  CERTIFICATE_PRICE_PAISE, certificateSettings, certificatesAllowed, eventPeople, followUpSettings, followUpsLeft,
} from '@/lib/events/after-event';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { refreshPaths } from '@/lib/revalidate';
import { eventSummary } from '@/lib/events/event-summary';
import { feedbackSettings, feedbackSummary } from '@/lib/events/feedback';
import { cleanGallery, cleanHttpsUrl, cleanRecapLinks, galleryLimit, MAX_RECAP_SUMMARY } from '@/lib/events/recap';

export const dynamic = 'force-dynamic';

/** Everything the "After the event" screen shows: who came, certificates, follow-ups and what's allowed. */
export async function GET(_request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.view');
  if (access instanceof NextResponse) return access;
  const { event } = access;

  const extra = await prisma.event.findUnique({
    where: { id: event.id },
    select: {
      feedbackSettings: true, recapSummary: true, recapLinks: true, galleryImageUrls: true,
      format: true, venueName: true, address: true, timezone: true, organizer: { select: { name: true, company: true, avatar: true } },
      agendaItems: { orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { startTime: 'asc' }], select: { id: true, dayNumber: true, startTime: true, title: true, recordingUrl: true, slidesUrl: true } },
    },
  });
  const fbSettings = feedbackSettings(extra?.feedbackSettings);
  const [people, issued, followUps, allowed, left, feedback] = await Promise.all([
    eventPeople(event.id),
    prisma.eventCertificate.count({ where: { eventId: event.id, revokedAt: null } }),
    prisma.eventEmailCampaign.findMany({
      where: { eventId: event.id, kind: 'FOLLOW_UP' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, status: true, sentAt: true, createdAt: true, recipientCount: true, audienceQuery: true },
    }),
    certificatesAllowed(event),
    followUpsLeft(event),
    feedbackSummary(event.id, fbSettings.questions),
  ]);
  const summary = await eventSummary(event.id);
  const attended = people.filter((p) => p.attended).length;
  return NextResponse.json({
    success: true,
    event: { id: event.id, slug: event.slug, title: event.title, startAt: event.startAt, endAt: event.endAt, started: event.startAt <= new Date(), ended: event.endAt <= new Date() },
    sources: summary.sources,
    counts: { registered: people.length, attended, missed: people.length - attended, optedOut: people.filter((p) => p.optedOut).length },
    certificates: {
      allowed, paid: !!event.certificatesPaidAt, pricePaise: CERTIFICATE_PRICE_PAISE, issued,
      configured: !!event.certificateSettings, settings: certificateSettings(event.certificateSettings),
      // What the form's live preview prints around the host's own choices.
      sample: {
        hostName: extra?.organizer.company || extra?.organizer.name || 'Host',
        logoUrl: extra?.organizer.avatar ?? null,
        dateLine: [eventDateText(event.startAt, event.endAt, event.timezone), extra ? eventPlaceText(extra) : ''].filter(Boolean).join(' · '),
      },
    },
    recap: {
      summary: extra?.recapSummary ?? '', links: cleanRecapLinks(extra?.recapLinks), gallery: extra?.galleryImageUrls ?? [],
      galleryLimit: await galleryLimit(event.organizerId), sessions: extra?.agendaItems ?? [],
    },
    feedback: { settings: fbSettings, ...feedback, responseRate: attended ? Math.round((feedback.responses / attended) * 100) : null },
    followUp: {
      settings: followUpSettings(event.followUpSettings, event.title), left, autoSentAt: event.followUpAutoSentAt,
      history: followUps.map((f) => ({ id: f.id, status: f.status, sentAt: f.sentAt ?? f.createdAt, recipients: f.recipientCount, detail: f.audienceQuery })),
    },
  });
}

/** Save certificate and/or follow-up settings. */
export async function PUT(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.edit');
  if (access instanceof NextResponse) return access;
  const limited = await hostWriteLimit(access.session.id);
  if (limited) return limited;
  const { event, session } = access;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.certificateSettings !== undefined) {
    const asked = (body.certificateSettings && typeof body.certificateSettings === 'object' ? body.certificateSettings : {}) as Record<string, unknown>;
    // A pasted design is cleaned before it is stored: scripts, outside links and anything not a plain drawing go.
    const pasted = typeof asked.customSvg === 'string' ? asked.customSvg : '';
    const customSvg = pasted ? sanitizeCustomSvg(pasted) : '';
    if (asked.template === 'custom') {
      const stops = checkCustomSvg(customSvg || pasted).filter((x) => x.level === 'error');
      if (!customSvg || stops.length) return NextResponse.json({ success: false, field: 'customSvg', error: stops[0]?.message ?? 'This design couldn’t be read as SVG. Paste the whole code, from <svg to </svg>.' }, { status: 400 });
    }
    // Logos must be files uploaded here, like the signature: nothing is fetched from other sites.
    for (const key of ['logoUrl', 'partnerLogoUrl', 'signatureUrl'] as const) {
      if (typeof asked[key] === 'string' && asked[key] && !isOwnMediaUrl(asked[key] as string)) asked[key] = null;
    }
    data.certificateSettings = certificateSettings({ ...asked, customSvg }) as object;
  }
  if (body.followUpSettings !== undefined) {
    const s = followUpSettings(body.followUpSettings, event.title);
    data.followUpSettings = s as object;
    // Turning automatic sending back on after it ran doesn't send it twice.
  }
  if (body.feedbackSettings !== undefined) data.feedbackSettings = feedbackSettings(body.feedbackSettings) as object;
  if (body.recap !== undefined) {
    const r = (body.recap && typeof body.recap === 'object' ? body.recap : {}) as Record<string, unknown>;
    if (r.summary !== undefined) data.recapSummary = String(r.summary ?? '').trim().slice(0, MAX_RECAP_SUMMARY) || null;
    if (r.links !== undefined) data.recapLinks = cleanRecapLinks(r.links) as object[];
    if (r.gallery !== undefined) data.galleryImageUrls = cleanGallery(r.gallery, await galleryLimit(event.organizerId));
    // Per-session replay and slides links; only this event's own sessions.
    if (Array.isArray(r.sessions)) {
      for (const item of r.sessions.slice(0, 200) as Record<string, unknown>[]) {
        if (typeof item?.id !== 'string') continue;
        await prisma.eventAgendaItem.updateMany({
          where: { id: item.id, eventId: event.id },
          data: { recordingUrl: cleanHttpsUrl(item.recordingUrl), slidesUrl: cleanHttpsUrl(item.slidesUrl) },
        });
      }
      if (!Object.keys(data).length) data.updatedAt = new Date();
    }
  }
  if (!Object.keys(data).length) return NextResponse.json({ success: false, error: 'Nothing to save.' }, { status: 400 });
  await prisma.event.update({ where: { id: event.id }, data });
  if (body.recap !== undefined) refreshPaths([`/events/${event.slug}`]); // recap shows on the public page
  await logOrganizerActivity(session.organizerId, 'event_updated', { actor: organizerActor(session), request, metadata: { title: event.title, what: 'after-event settings' } }).catch(() => {});
  return NextResponse.json({ success: true });
}

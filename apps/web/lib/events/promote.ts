import { prisma } from '@udyaibase/database';
import { sendEmailBatch } from '@/lib/email/send';
import { esc, button, shell } from '@/lib/jobs/apply-emails';
import { generateUnsubscribeToken } from '@/lib/events/unsubscribe';
import { hostPlanStatus } from '@/lib/events/billing';
import { EVENT_CAMPAIGN_COOLDOWN_DAYS as COOLDOWN_DAYS } from '@udyaibase/utils/event-campaigns';

/**
 * Host promo emails. Sent by Udyaibase, in a fixed event-card template, only to event subscribers who
 * opted in to "upcoming AI events ... in my area" and live near the event (or anyone, for online events).
 * Never to the host's own list, never free-text marketing, one-click unsubscribe on every email.
 */

export const MAX_RECIPIENTS = 1000;
export const NOTE_MAX = 280;
const RADIUS_KM = 60;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

type PromoEvent = {
  id: string; title: string; slug: string; startAt: Date; format: string; venueName: string | null; address: string | null;
  latitude: number | null; longitude: number | null; coverImageUrl: string | null; subtitle: string | null;
};

const PROMO_EVENT_SELECT = {
  id: true, title: true, slug: true, startAt: true, endAt: true, format: true, venueName: true, address: true,
  latitude: true, longitude: true, coverImageUrl: true, subtitle: true, promoCredits: true, organizerId: true, status: true, visibility: true, deletedAt: true,
} as const;

/** Subscriber ids for an event: nearby (or all, for online), not already registered, not already emailed about it. */
async function audienceIds(ev: PromoEvent): Promise<string[]> {
  const city = (ev.address ?? ev.venueName ?? '').split(',').map((p) => p.trim()).filter((p) => p.length > 2);
  const near = ev.format === 'VIRTUAL'
    ? ''
    : `AND (
        ${ev.latitude != null && ev.longitude != null
          ? `(s."locationLat" IS NOT NULL AND 6371 * acos(LEAST(1, cos(radians($2::float8)) * cos(radians(s."locationLat")) * cos(radians(s."locationLng") - radians($3::float8)) + sin(radians($2::float8)) * sin(radians(s."locationLat")))) <= ${RADIUS_KM})`
          : 'false'}
        OR (s."locationCity" IS NOT NULL AND split_part(s."locationCity", ',', 1) <> '' AND $4::text ILIKE '%' || split_part(s."locationCity", ',', 1) || '%')
      )`;
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT s.id FROM "EventSubscriber" s
     WHERE s.subscribed = true AND s."unsubscribedAt" IS NULL AND s."consentAt" IS NOT NULL
       AND $2::float8 IS NOT NULL AND $3::float8 IS NOT NULL AND $4::text IS NOT NULL
       ${near}
       AND NOT EXISTS (SELECT 1 FROM "EventRegistration" r WHERE r."eventId" = $1 AND lower(r."guestEmail") = lower(s.email) AND r."deletedAt" IS NULL)
       AND NOT EXISTS (SELECT 1 FROM "EventCampaignRecipient" cr JOIN "EventEmailCampaign" c ON c.id = cr."campaignId" WHERE c."eventId" = $1 AND cr."subscriberId" = s.id)
     ORDER BY s."createdAt" DESC
     LIMIT ${MAX_RECIPIENTS}`,
    ev.id, ev.latitude ?? 0, ev.longitude ?? 0, [ev.address, ev.venueName, ...city].filter(Boolean).join(' '),
  );
  return rows.map((r) => r.id);
}

export async function promoAudienceSize(organizerId: string, eventId: string): Promise<number | null> {
  const ev = await prisma.event.findFirst({ where: { id: eventId, organizerId, deletedAt: null }, select: PROMO_EVENT_SELECT });
  if (!ev) return null;
  return (await audienceIds(ev)).length;
}

export type PromoOutcome = { ok: true; recipients: number } | { ok: false; status: number; error: string };

/** Queue a promo email for an event. Sends in the background; returns the recipient count. */
export async function startPromo(organizerId: string, eventId: string, note: string): Promise<PromoOutcome & { send?: () => Promise<void> }> {
  const ev = await prisma.event.findFirst({ where: { id: eventId, organizerId }, select: PROMO_EVENT_SELECT });
  if (!ev || ev.deletedAt || ev.status !== 'PUBLISHED' || ev.visibility !== 'PUBLIC' || ev.endAt <= new Date()) {
    return { ok: false, status: 400, error: 'Choose an upcoming, public, published event.' };
  }
  const recent = await prisma.eventEmailCampaign.findFirst({
    // Any campaign for this event counts (the host's own or Udyaibase's), so subscribers get it at most once a week.
    where: { eventId, createdAt: { gte: new Date(Date.now() - COOLDOWN_DAYS * 864e5) } }, select: { id: true },
  });
  if (recent) return { ok: false, status: 429, error: `This event was promoted in the last ${COOLDOWN_DAYS} days. Try again later.` };

  const status = await hostPlanStatus(organizerId);
  const source = ev.promoCredits > 0 ? 'BOOST' : status && status.promo.left > 0 ? 'PLAN' : null;
  if (!source) return { ok: false, status: 402, error: 'No promo emails left. Boost this event or upgrade to Pro.' };

  const ids = await audienceIds(ev);
  if (!ids.length) return { ok: false, status: 400, error: 'No subscribers near this event yet. Your credit wasn’t used.' };

  const cleanNote = note.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  const subject = `${ev.title} · ${ev.startAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`;
  const campaign = await prisma.$transaction(async (tx) => {
    if (source === 'BOOST') {
      const took = await tx.event.updateMany({ where: { id: ev.id, promoCredits: { gt: 0 } }, data: { promoCredits: { decrement: 1 } } });
      if (!took.count) throw new Error('no_credit');
    }
    const c = await tx.eventEmailCampaign.create({
      data: { eventId: ev.id, organizerId, subject, bodyJson: { note: cleanNote }, status: 'SENDING', recipientCount: ids.length, creditSource: source },
    });
    await tx.eventCampaignRecipient.createMany({ data: ids.map((subscriberId) => ({ campaignId: c.id, subscriberId })), skipDuplicates: true });
    return c;
  }).catch(() => null);
  if (!campaign) return { ok: false, status: 409, error: 'That credit was just used. Refresh and try again.' };

  const organizer = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { name: true, company: true } });
  const host = organizer?.company || organizer?.name || 'The organiser';

  return {
    ok: true,
    recipients: ids.length,
    send: async () => {
      const subs = await prisma.eventSubscriber.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } });
      let sent = 0;
      for (let i = 0; i < subs.length; i += 100) {
        const chunk = subs.slice(i, i + 100);
        const items = await Promise.all(chunk.map(async (s) => {
          const unsub = `${SITE}/api/events/unsubscribe?token=${await generateUnsubscribeToken(s.id, s.email)}`;
          return {
            to: s.email, subject, type: 'event_host_promo',
            headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
            html: promoHtml(ev, host, cleanNote, s.name, unsub, campaign.id),
          };
        }));
        const res = await sendEmailBatch(items, { idempotencyKey: `promo:${campaign.id}:${i}` });
        const ok = chunk.filter((_, j) => res[j]?.success).map((s) => s.id);
        sent += ok.length;
        if (ok.length) await prisma.eventCampaignRecipient.updateMany({ where: { campaignId: campaign.id, subscriberId: { in: ok } }, data: { sentAt: new Date() } });
      }
      await prisma.eventEmailCampaign.update({ where: { id: campaign.id }, data: { status: sent ? 'SENT' : 'FAILED', sentAt: new Date(), recipientCount: sent } });
      // Nothing went out: give the Boost credit back (failed Pro sends aren't counted against the month).
      if (!sent && source === 'BOOST') await prisma.event.update({ where: { id: ev.id }, data: { promoCredits: { increment: 1 } } });
    },
  };
}

function promoHtml(ev: PromoEvent, host: string, note: string, name: string | null, unsub: string, campaignId: string) {
  const when = ev.startAt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const where = ev.format === 'VIRTUAL' ? 'Online' : [ev.venueName, ev.address?.split(',').slice(-2, -1)[0]?.trim()].filter(Boolean).join(', ') || 'In person';
  const link = `${SITE}/events/${ev.slug}?utm_source=udyaibase&utm_medium=email&utm_campaign=host_promo_${campaignId.slice(0, 8)}`;
  return shell(`
<p style="margin:0 0 6px;font-size:13px;color:#6b7280">An AI event near you${name ? `, ${esc(name.split(' ')[0])}` : ''}</p>
${ev.coverImageUrl && /^https:\/\//.test(ev.coverImageUrl) ? `<img src="${esc(ev.coverImageUrl)}" alt="" width="496" style="width:100%;max-width:496px;border-radius:10px;margin:0 0 16px;display:block">` : ''}
<h1 style="font-size:20px;margin:0 0 6px">${esc(ev.title)}</h1>
${ev.subtitle ? `<p style="margin:0 0 12px;font-size:15px;color:#374151">${esc(ev.subtitle)}</p>` : ''}
<p style="margin:0 0 4px;font-size:15px"><strong>${esc(when)}</strong></p>
<p style="margin:0 0 16px;font-size:15px;color:#374151">${esc(where)} · by ${esc(host)}</p>
${note ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;border-left:3px solid #e5e7eb;padding-left:12px;color:#374151">“${esc(note)}”<br><span style="font-size:13px;color:#6b7280">${esc(host)}</span></p>` : ''}
<p style="margin:0 0 24px">${button(link, 'See the event')}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">You’re getting this because you asked Udyaibase to tell you about AI events in your area. <a href="${unsub}" style="color:#6b7280">Unsubscribe</a></p>`);
}

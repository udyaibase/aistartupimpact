"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { Resend } from "resend";
import { eventPromotionHtml } from "@udyaibase/utils";
import { eventUnsubscribeUrl } from "@/lib/event-unsubscribe";
import { EVENT_CAMPAIGN_COOLDOWN_DAYS as COOLDOWN_DAYS } from "@udyaibase/utils/event-campaigns";

const EVENT_ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF"];

let resend: Resend | null = null;
function getResend() {
  if (!resend && process.env.RESEND_API_KEY) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";
const FROM_NAME = process.env.RESEND_FROM_NAME || "Udyaibase";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";


type Filters = { city?: string; occupation?: string; eventSlug?: string };

/**
 * Who a campaign may go to: consented, still-subscribed event subscribers matching the filters.
 * For an event campaign, people already registered or already emailed about that event (by admin
 * or the host's Promote) are skipped, so nobody gets the same event twice.
 */
async function campaignAudience(filters: Filters) {
  const subscribers = await prisma.eventSubscriber.findMany({
    where: { subscribed: true, unsubscribedAt: null, consentAt: { not: null }, ...(filters.city ? { locationCity: filters.city } : {}) },
    select: { id: true, email: true, name: true },
  });
  let audience = subscribers;
  if (filters.occupation) {
    const regEmails = await prisma.eventRegistration.findMany({
      where: { guestOccupation: filters.occupation, deletedAt: null },
      select: { guestEmail: true },
      distinct: ["guestEmail"],
    });
    const occ = new Set(regEmails.map((r) => (r.guestEmail ?? '').toLowerCase()));
    audience = audience.filter((s) => occ.has(s.email.toLowerCase()));
  }
  let event: { id: string; slug: string } | null = null;
  if (filters.eventSlug) {
    event = await prisma.event.findFirst({ where: { slug: filters.eventSlug, deletedAt: null }, select: { id: true, slug: true } });
    if (event) {
      const [registered, emailed] = await Promise.all([
        prisma.eventRegistration.findMany({ where: { eventId: event.id, deletedAt: null }, select: { guestEmail: true } }),
        prisma.eventCampaignRecipient.findMany({ where: { campaign: { eventId: event.id } }, select: { subscriberId: true } }),
      ]);
      const reg = new Set(registered.map((r) => (r.guestEmail ?? '').toLowerCase()));
      const sent = new Set(emailed.map((r) => r.subscriberId));
      audience = audience.filter((s) => !reg.has(s.email.toLowerCase()) && !sent.has(s.id));
    }
  }
  return { audience, event };
}

/** Preview how many people a campaign would reach (same rules as sending). */
export async function getAudiencePreviewAction(filters: Filters) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) return { count: 0 };
  try {
    return { count: (await campaignAudience(filters)).audience.length };
  } catch (error) {
    console.error("Audience preview error:", error);
    return { count: 0 };
  }
}

/**
 * Send a campaign to event subscribers. Recorded like host promos (EventEmailCampaign + recipients),
 * so one event is promoted at most once a week across admin and hosts, and every email carries a
 * signed one-click unsubscribe link.
 */
export async function sendCampaignAction(data: { subject: string; body: string } & Filters) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) return { success: false, error: "Unauthorized" };
  const client = getResend();
  if (!client) return { success: false, error: "Email not configured" };
  if (!data.subject?.trim() || !data.body?.trim()) return { success: false, error: "Subject and message are required" };

  try {
    const { audience, event } = await campaignAudience(data);
    if (data.eventSlug && !event) return { success: false, error: "Event not found" };
    if (event) {
      const recent = await prisma.eventEmailCampaign.findFirst({
        where: { eventId: event.id, createdAt: { gte: new Date(Date.now() - COOLDOWN_DAYS * 864e5) } },
        select: { id: true },
      });
      if (recent) return { success: false, error: `This event was already promoted in the last ${COOLDOWN_DAYS} days.` };
    }
    if (audience.length === 0) return { success: false, error: "No matching subscribers (already registered or already emailed are skipped)" };

    const campaign = await prisma.eventEmailCampaign.create({
      data: { eventId: event?.id ?? null, subject: data.subject.slice(0, 200), bodyHtml: null, bodyJson: { body: data.body, filters: { city: data.city ?? null, occupation: data.occupation ?? null }, by: session.user.email ?? null },
        status: "SENDING", recipientCount: audience.length, creditSource: "ADMIN" },
    });
    await prisma.eventCampaignRecipient.createMany({ data: audience.map((s) => ({ campaignId: campaign.id, subscriberId: s.id })), skipDuplicates: true });

    const ctaUrl = event ? `${SITE_URL}/events/${event.slug}` : `${SITE_URL}/events`;
    const ctaLabel = event ? "Register Now →" : "Browse Events";
    let sent = 0;
    for (let i = 0; i < audience.length; i += 100) {
      const batch = audience.slice(i, i + 100);
      try {
        await client.batch.send(
          batch.map((s) => {
            const unsubUrl = eventUnsubscribeUrl(SITE_URL, s.id, s.email);
            return {
              from: `${FROM_NAME} <${FROM_EMAIL}>`,
              to: s.email,
              subject: data.subject,
              html: eventPromotionHtml(data.subject, data.body, ctaUrl, ctaLabel, unsubUrl),
              headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
            };
          }),
          { idempotencyKey: `admin-campaign:${campaign.id}:${i}` },
        );
        sent += batch.length;
        await prisma.eventCampaignRecipient.updateMany({ where: { campaignId: campaign.id, subscriberId: { in: batch.map((s) => s.id) } }, data: { sentAt: new Date() } });
      } catch (e) { console.error("Batch error:", e); }
    }
    await prisma.eventEmailCampaign.update({ where: { id: campaign.id }, data: { status: sent ? "SENT" : "FAILED", sentAt: new Date(), recipientCount: sent } });
    return sent ? { success: true, count: sent } : { success: false, error: "Sending failed. Try again later." };
  } catch (error: any) {
    console.error("Campaign error:", error);
    return { success: false, error: "Send failed" };
  }
}

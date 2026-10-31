import { prisma } from "@udyaibase/database";
import { effectiveHostPlan, registrationLimit, waitlistReason } from "@/lib/events/plans";
import { notifyHostPlanLimit, sendRegistrationStatusEmail } from "@/lib/events/waitlist";
import { generateQrToken } from "@/lib/events/qr-token";
import { sendRegistrationConfirmationEmail, sendNewsletterWelcomeEmail } from "@/lib/events/email";
import { generateGoogleCalendarUrl } from "@/lib/events/calendar";
import { refreshPaths } from "@/lib/revalidate";

const CONSENT_TEXT =
  "Keep me updated about upcoming AI events, conferences, and opportunities in my area. You can unsubscribe anytime.";
const CONSENT_VERSION = 1;

export interface RegisterForEventParams {
  eventId: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  occupation?: string;
  ticketTierId?: string;
  answers?: Array<{ questionId: string; answerText: string }>;
  newsletterConsent?: boolean;
  whatsappConsent?: boolean;
  locationCity?: string;
  registrationSource: "WEBSITE" | "EMBED" | "WALK_IN";
  referrerUrl?: string;
  embedWidgetId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface RegisterForEventResult {
  registrationId: string;
  status: string;
  qrToken: string;
  waitlistPosition?: number;
  /** Waitlisted because the host's own capacity is full, or because of their plan's cap (the host has been told). */
  waitlistReason?: 'capacity' | 'plan_limit';
}

export async function registerForEvent(
  params: RegisterForEventParams
): Promise<RegisterForEventResult> {
  const {
    eventId, name, email, phone, company, role, occupation,
    ticketTierId, answers, newsletterConsent, whatsappConsent,
    locationCity, registrationSource, referrerUrl, embedWidgetId, utmSource, utmMedium, utmCampaign,
  } = params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, status: true, capacity: true, registrationCount: true,
      registrationDeadline: true, startAt: true, approvalRequired: true, boostedAt: true,
      deletedAt: true, title: true, slug: true, tags: { select: { tagId: true } },
      organizer: { select: { plan: true, planExpiresAt: true, email: true } },
    },
  });

  if (!event || event.deletedAt || event.status !== "PUBLISHED") {
    throw new RegistrationError("Event not found or not available.", 404, "not_found");
  }

  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new RegistrationError("Registration deadline has passed.", 400, "closed");
  }

  // Paid tickets only through checkout: no free registration with a paid tier, or on an all-paid event.
  // Walk-ins are added by the host at the door (they may have paid there), so they're exempt.
  const tiers = registrationSource === "WALK_IN" ? [] : await prisma.eventTicketTier.findMany({ where: { eventId }, select: { id: true, priceCents: true } });
  if (ticketTierId && registrationSource !== "WALK_IN") {
    const t = tiers.find((x) => x.id === ticketTierId);
    if (!t) throw new RegistrationError("Choose a valid ticket.", 400, "invalid_tier");
    if (t.priceCents > 0) throw new RegistrationError("This ticket needs to be paid for.", 402, "payment_required");
  } else if (tiers.length > 0 && tiers.every((x) => x.priceCents > 0)) {
    throw new RegistrationError("This event needs a paid ticket.", 402, "payment_required");
  }

  const qrToken = generateQrToken(16);
  // The host's own capacity, capped by their plan (raised by an Event Boost). Over the limit → waitlist.
  const hostPlan = effectiveHostPlan(event.organizer);
  const limit = registrationLimit(hostPlan, event);

  const existingReg = await prisma.eventRegistration.findUnique({
    where: { eventId_guestEmail: { eventId, guestEmail: email } },
    select: { deletedAt: true },
  });
  if (existingReg && !existingReg.deletedAt) {
    throw new RegistrationError("You are already registered for this event.", 409, "already_registered");
  }

  // One statement, so it works on the Neon HTTP driver (no interactive transactions).
  // FOR UPDATE serialises concurrent registrations on the event row; the count trigger
  // bumps "registrationCount" inside the same statement, so the next waiter sees it.
  let rows: { id: string; status: string; qrToken: string }[];
  try {
    rows = await prisma.$queryRaw<{ id: string; status: string; qrToken: string }[]>`
      WITH e AS (
        SELECT id, capacity, "registrationCount", "approvalRequired"
        FROM "Event" WHERE id = ${eventId} FOR UPDATE
      )
      INSERT INTO "EventRegistration" (
        id, "eventId", "guestName", "guestEmail", "guestPhone", "guestCompany", "guestRole",
        "guestOccupation", "whatsappConsent", "ticketTierId", "registrationSource", "referrerUrl",
        "embedWidgetId", "utmSource", "utmMedium", "utmCampaign", status, "qrToken", "updatedAt"
      )
      SELECT
        gen_random_uuid(), e.id, ${name}, ${email}, ${phone || null}, ${company || null}, ${role || null},
        ${occupation || null}, ${whatsappConsent || false}, ${ticketTierId || null}, ${registrationSource},
        ${referrerUrl || null}, ${embedWidgetId || null}, ${utmSource || null}, ${utmMedium || null},
        ${utmCampaign || null},
        (CASE
          WHEN e."approvalRequired" THEN 'PENDING_APPROVAL'
          WHEN e."registrationCount" >= ${limit}::int THEN 'WAITLISTED'
          ELSE 'CONFIRMED'
        END)::"RegistrationStatus",
        ${qrToken}, NOW()
      FROM e
      RETURNING id, status::text AS status, "qrToken"`;
  } catch (err) {
    if (String((err as Error)?.message).includes("23505")) {
      throw new RegistrationError("You are already registered for this event.", 409, "already_registered");
    }
    throw err;
  }
  const registration = rows[0];
  if (!registration) throw new RegistrationError("Event not found or not available.", 404, "not_found");

  // Save custom question answers
  if (answers && answers.length > 0) {
    await prisma.eventRegistrationAnswer.createMany({
      data: answers
        .filter((a) => a.answerText)
        .map((a) => ({
          registrationId: registration.id,
          questionId: a.questionId,
          answerText: a.answerText,
        })),
    });
  }

  // Newsletter subscription (if consent given)
  if (newsletterConsent) {
    await handleNewsletterSubscription(email, name, locationCity, eventId, event.tags);
  }

  let waitlistPosition: number | undefined;
  let reason: 'capacity' | 'plan_limit' | undefined;
  if (registration.status === "WAITLISTED") {
    const [pos] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "EventRegistration"
      WHERE "eventId" = ${eventId} AND status = 'WAITLISTED' AND "deletedAt" IS NULL
        AND "registeredAt" <= (SELECT "registeredAt" FROM "EventRegistration" WHERE id = ${registration.id})`;
    waitlistPosition = pos?.n;
    reason = waitlistReason(hostPlan, event);
    await prisma.eventRegistration.update({ where: { id: registration.id }, data: { waitlistReason: reason } });
    if (reason === "plan_limit") notifyHostPlanLimit(eventId).catch(() => {});
  }

  // "Spots left" on the cached event page.
  refreshPaths([`/events/${event.slug}`]);

  // The ticket (QR) only goes to confirmed attendees; waitlisted and pending people get it when they're let in.
  if (registration.status === "CONFIRMED") {
    sendConfirmationEmail(eventId, email, name, qrToken).catch(() => {});
  } else if (registration.status === "WAITLISTED" || registration.status === "PENDING_APPROVAL") {
    sendRegistrationStatusEmail({ to: email, name, eventTitle: event.title, slug: event.slug, status: registration.status, position: waitlistPosition });
  }

  return {
    registrationId: registration.id,
    status: registration.status,
    qrToken: registration.qrToken,
    waitlistPosition,
    waitlistReason: reason,
  };
}

export class RegistrationError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function handleNewsletterSubscription(
  email: string, name: string, locationCity: string | undefined,
  eventId: string, eventTags: { tagId: string }[]
) {
  const existingSub = await prisma.eventSubscriber.findUnique({ where: { email } });

  let isNewSubscriber = false;
  let subscriberId: string | null = null;

  if (!existingSub) {
    let lat: number | null = null;
    let lng: number | null = null;
    let countryCode: string | null = null;
    let region: string | null = null;

    if (locationCity) {
      const cityName = locationCity.split(",")[0]?.trim();
      if (cityName) {
        const cityRecord = await prisma.city.findFirst({
          where: {
            OR: [
              { name: { equals: cityName, mode: "insensitive" } },
              { aliases: { has: cityName.toLowerCase() } },
            ],
          },
          select: { latitude: true, longitude: true, country: true, state: true },
        });
        if (cityRecord) {
          lat = cityRecord.latitude;
          lng = cityRecord.longitude;
          countryCode = cityRecord.country === "India" ? "IN" : cityRecord.country?.slice(0, 2).toUpperCase() || null;
          region = cityRecord.state || null;
        }
      }
    }

    const subscriber = await prisma.eventSubscriber.create({
      data: {
        email, name,
        locationCity: locationCity || null,
        locationLat: lat, locationLng: lng,
        locationCountryCode: countryCode, locationRegion: region,
        subscribed: true, consentAt: new Date(),
        consentSource: `event_registration:${eventId}`,
        consentText: CONSENT_TEXT, consentVersion: CONSENT_VERSION,
      },
    });
    isNewSubscriber = true;
    subscriberId = subscriber.id;

    try {
      await prisma.newsletterSubscriber.upsert({
        where: { email },
        update: { isActive: true, tags: { push: "events" } },
        create: {
          id: crypto.randomUUID(), email, name,
          source: `event_registration:${eventId}`,
          isActive: true, subscribedAt: new Date(),
          tags: ["events", locationCity || ""].filter(Boolean),
        },
      });
    } catch (e) {
      console.error("NewsletterSubscriber dual-write error:", e);
    }

    if (eventTags.length > 0) {
      await prisma.eventSubscriberInterest.createMany({
        data: eventTags.map((t) => ({ subscriberId: subscriber.id, tagId: t.tagId })),
        skipDuplicates: true,
      });
    }
  } else if (existingSub.subscribed && !existingSub.unsubscribedAt) {
    subscriberId = existingSub.id;
    if (eventTags.length > 0) {
      await prisma.eventSubscriberInterest.createMany({
        data: eventTags.map((t) => ({ subscriberId: existingSub.id, tagId: t.tagId })),
        skipDuplicates: true,
      });
    }
    if (locationCity && !existingSub.locationCity) {
      await prisma.eventSubscriber.update({
        where: { id: existingSub.id }, data: { locationCity },
      });
    }
  }

  if (isNewSubscriber && subscriberId) {
    sendNewsletterWelcomeEmail(email, name, subscriberId).catch(() => {});
  }
}

export async function sendConfirmationEmail(eventId: string, email: string, name: string, qrToken: string) {
  const eventForEmail = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      title: true, slug: true, startAt: true, endAt: true,
      timezone: true, venueName: true, address: true, format: true,
    },
  });

  if (!eventForEmail) return;

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";
  const eventUrl = `${SITE_URL}/events/${eventForEmail.slug}`;

  const eventDate = eventForEmail.startAt.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const eventTime = eventForEmail.startAt.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });

  const location = eventForEmail.venueName
    ? `${eventForEmail.venueName}${eventForEmail.address ? `, ${eventForEmail.address}` : ""}`
    : eventForEmail.format === "VIRTUAL" ? "Virtual" : undefined;

  const googleCalUrl = generateGoogleCalendarUrl({
    title: eventForEmail.title,
    description: `Registered via Udyaibase`,
    startAt: eventForEmail.startAt.toISOString(),
    endAt: eventForEmail.endAt.toISOString(),
    timezone: eventForEmail.timezone,
    location, url: eventUrl,
  });

  await sendRegistrationConfirmationEmail(email, name, {
    eventTitle: eventForEmail.title,
    eventSlug: eventForEmail.slug,
    eventDate, eventTime,
    eventTimezone: eventForEmail.timezone,
    venueName: eventForEmail.venueName || undefined,
    address: eventForEmail.address || undefined,
    format: eventForEmail.format,
    qrToken,
    googleCalendarUrl: googleCalUrl,
    startAtIso: eventForEmail.startAt.toISOString(),
    endAtIso: eventForEmail.endAt.toISOString(),
  });
}

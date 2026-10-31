import { jsonLd } from "@/lib/json-ld";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { sql } from "@/lib/db";
import EventDetailClient from "./EventDetailClient";
import TrackView from '@/components/TrackView';
import { sanitizeHtml } from "@/lib/sanitize";

export const revalidate = 60;

async function getEvent(slug: string) {
  try {
    // 1. Try current slug
    const rows: any[] = await sql`
      SELECT 
        e.id, e.slug, e."shortCode", e.title, e.subtitle, e.category, e.format, e.status,
        e."startAt"::text AS "startAt", e."endAt"::text AS "endAt",
        e.timezone, e."venueName", e.address, e.latitude, e.longitude,
        e."meetingLink", e."revealLinkAfterRegistration",
        e."coverImageUrl", e."galleryImageUrls", e.description,
        e.capacity, e."registrationCount", e.visibility,
        e."registrationDeadline"::text AS "registrationDeadline",
        e."approvalRequired",
        e."metaTitle", e."metaDescription", e."socialImageUrl",
        e."sourceUrl", e."sourceName",
        e."organizerId", e."deletedAt",
        o.name AS "organizerName", o.avatar AS "organizerAvatar"
      FROM "Event" e
      LEFT JOIN "EventOrganizer" o ON o.id = e."organizerId"
      WHERE e.slug = ${slug}
      LIMIT 1
    `;

    if (rows.length) {
      const event = rows[0];
      // Soft-deleted → 410 Gone (handled via notFound for now)
      if (event.deletedAt) return { __gone: true };
      // Not published / not visible
      if (event.status !== "PUBLISHED" || !["PUBLIC", "UNLISTED"].includes(event.visibility)) return null;
      return event;
    }

    // 2. Check slug history → redirect to current slug (no chains)
    const historyRows: any[] = await sql`
      SELECT e.slug
      FROM "EventSlugHistory" h
      JOIN "Event" e ON e.id = h."eventId"
      WHERE h."oldSlug" = ${slug} AND e."deletedAt" IS NULL
      LIMIT 1
    `;

    if (historyRows.length) {
      return { __redirect: historyRows[0].slug };
    }

    return null;
  } catch (e) {
    console.error("getEvent error:", e);
    return null;
  }
}

async function getEventSpeakers(eventId: string) {
  try {
    const rows = await sql`
      SELECT id, name, title, company, "headshotUrl", bio, "talkTitle", "sortOrder"
      FROM "EventSpeaker"
      WHERE "eventId" = ${eventId}
      ORDER BY "sortOrder" ASC
    `;
    return rows;
  } catch {
    return [];
  }
}

async function getEventAgenda(eventId: string) {
  try {
    const rows = await sql`
      SELECT a.id, a."dayNumber", a."startTime", a."endTime", a.title, a.description,
             s.name AS "speakerName"
      FROM "EventAgendaItem" a
      LEFT JOIN "EventSpeaker" s ON s.id = a."speakerId"
      WHERE a."eventId" = ${eventId}
      ORDER BY a."dayNumber" ASC, a."sortOrder" ASC
    `;
    return rows;
  } catch {
    return [];
  }
}

async function getEventTags(eventId: string) {
  try {
    const rows = await sql`
      SELECT t.name, t."canonicalName"
      FROM "EventTagMapping" m
      JOIN "EventTag" t ON t.id = m."tagId"
      WHERE m."eventId" = ${eventId}
      ORDER BY t.name
    `;
    return rows;
  } catch {
    return [];
  }
}

async function getEventTicketTiers(eventId: string) {
  try {
    const rows = await sql`
      SELECT id, name, "priceCents", quantity, "soldCount", "tierType", description
      FROM "EventTicketTier"
      WHERE "eventId" = ${eventId}
      ORDER BY "priceCents" ASC
    `;
    return rows;
  } catch {
    return [];
  }
}

async function getEventCustomQuestions(eventId: string) {
  try {
    const rows = await sql`
      SELECT id, "questionText", "questionType", options, required, "sortOrder"
      FROM "EventCustomQuestion"
      WHERE "eventId" = ${eventId}
      ORDER BY "sortOrder" ASC
    `;
    return rows;
  } catch {
    return [];
  }
}

async function getSimilarEvents(eventId: string, category: string) {
  try {
    const now = new Date().toISOString();
    const rows = await sql`
      SELECT id, title, slug, category, format,
             "startAt"::text AS "startAt", "venueName",
             "coverImageUrl", "registrationCount"
      FROM "Event"
      WHERE id != ${eventId}
        AND status = 'PUBLISHED'
        AND "deletedAt" IS NULL
        AND visibility = 'PUBLIC'
        AND "startAt" >= ${now}::timestamp
        AND category = ${category}::"EventCategory"
      ORDER BY "startAt" ASC
      LIMIT 3
    `;
    return rows;
  } catch {
    return [];
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const event = await getEvent(params.slug);
  if (!event) return { title: "Event Not Found" };

  const title = event.metaTitle || event.title;
  const description =
    event.metaDescription ||
    event.subtitle ||
    `${event.category.replace("_", " ")} - ${new Date(event.startAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `https://udyaibase.com/events/${event.slug}`,
      images: event.socialImageUrl || event.coverImageUrl
        ? [{ url: event.socialImageUrl || event.coverImageUrl }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export async function generateStaticParams() {
  try {
    const rows = await sql`
      SELECT slug FROM "Event"
      WHERE "deletedAt" IS NULL AND "isApproved" = true
      ORDER BY "startDate" DESC NULLS LAST
      LIMIT 30
    `;
    return rows.map((r: any) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

export default async function EventDetailPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const event = await getEvent(params.slug);

  // Handle redirect (old slug → current slug, no chains)
  if (event && (event as any).__redirect) {
    redirect(`/events/${(event as any).__redirect}`);
  }

  // Handle 410 Gone (soft-deleted)
  if (event && (event as any).__gone) {
    notFound();
  }

  if (!event) notFound();

  const [speakers, agenda, tags, ticketTiers, customQuestions, similarEvents] =
    await Promise.all([
      getEventSpeakers(event.id),
      getEventAgenda(event.id),
      getEventTags(event.id),
      getEventTicketTiers(event.id),
      getEventCustomQuestions(event.id),
      getSimilarEvents(event.id, event.category),
    ]);

  const eventUrl = `https://udyaibase.com/events/${event.slug}`;
  const descriptionText = typeof event.description === 'string'
    ? event.description.slice(0, 300)
    : (event.subtitle || event.title);

  const eventSchema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": event.title,
    "description": descriptionText,
    "startDate": event.startAt,
    "url": eventUrl,
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": event.format === "VIRTUAL"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : event.format === "HYBRID"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
  };

  if (event.endAt) eventSchema.endDate = event.endAt;
  if (event.coverImageUrl) eventSchema.image = event.coverImageUrl;
  if (event.capacity) eventSchema.maximumAttendeeCapacity = event.capacity;

  if (event.format === "VIRTUAL") {
    eventSchema.location = {
      "@type": "VirtualLocation",
      "url": event.meetingLink || eventUrl,
    };
  } else if (event.venueName) {
    eventSchema.location = {
      "@type": "Place",
      "name": event.venueName,
      ...(event.address ? { "address": event.address } : {}),
    };
  }

  if (event.organizerName) {
    eventSchema.organizer = {
      "@type": "Organization",
      "name": event.organizerName,
    };
  }

  // Include ticket pricing as offers
  if (ticketTiers && (ticketTiers as any[]).length > 0) {
    eventSchema.offers = (ticketTiers as any[]).map((tier: any) => ({
      "@type": "Offer",
      "name": tier.name,
      "price": tier.priceCents != null ? (tier.priceCents / 100).toFixed(2) : "0",
      "priceCurrency": "INR",
      "url": eventUrl,
      "availability": tier.quantity && tier.soldCount >= tier.quantity
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
    }));
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
      { '@type': 'ListItem', position: 2, name: 'AI Events', item: 'https://udyaibase.com/events' },
      { '@type': 'ListItem', position: 3, name: event.title, item: `https://udyaibase.com/events/${event.slug}` },
    ],
  };

  return (
    <>
      <TrackView entityType="event" entityId={event.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(eventSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />
      <EventDetailClient
        event={{
          ...event,
          description: event.description && typeof event.description === "object" && event.description.html
            ? { ...event.description, html: sanitizeHtml(event.description.html) }
            : event.description,
        }}
        speakers={speakers as any}
        agenda={agenda as any}
        tags={tags as any}
        ticketTiers={ticketTiers as any}
        customQuestions={customQuestions as any}
        similarEvents={similarEvents as any}
      />
    </>
  );
}

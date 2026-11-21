import { eventCity } from '@/lib/events/public-place';
import { eventInstant } from '@/lib/events/zoned-time';
import { jsonLd } from "@/lib/json-ld";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { sql } from "@/lib/db";
import EventDetailClient from "./EventDetailClient";
import EventRecap from "@/components/events/EventRecap";
import { cleanRecapLinks, RECAP_MIN_ATTENDED } from "@/lib/events/recap";
import { cfpIsOpen, cfpSettings } from "@/lib/events/cfp";
import EventSponsors from "@/components/events/EventSponsors";
import Link from "next/link";
import TrackView from '@/components/TrackView';
import { sanitizeHtml } from "@/lib/sanitize";
import { descriptionHtml, descriptionText, metaSnippet } from "@/lib/events/description";

export const revalidate = 3600;

const PUBLIC_STATUSES = ["PUBLISHED", "COMPLETED", "POSTPONED", "CANCELLED"];

async function getEvent(slug: string) {
  try {
    // 1. Try current slug
    const rows: any[] = await sql`
      SELECT 
        e.id, e.slug, e."shortCode", e.title, e.subtitle, e.category, e.format, e.status,
        to_char(e."startAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startAt", to_char(e."endAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endAt",
        e.timezone, e."venueName", e.address, e.latitude, e.longitude,
        e."meetingLink", e."revealLinkAfterRegistration",
        e."coverImageUrl", e."galleryImageUrls", e.description,
        e.capacity, e."registrationCount", e.visibility,
        to_char(e."registrationDeadline", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "registrationDeadline",
        e."approvalRequired",
        e."metaTitle", e."metaDescription", e."socialImageUrl",
        e."sourceUrl", e."sourceName",
        e."organizerId", e."deletedAt", e."recapSummary", e."recapLinks", e."agendaTracks", e."cfpSettings",
        o.name AS "organizerName", o.avatar AS "organizerAvatar", (o."verifiedAt" IS NOT NULL) AS "organizerVerified",
        st.name AS "hostStartupName", st.slug AS "hostStartupSlug",
        ser.name AS "seriesName", ser.slug AS "seriesSlug"
      FROM "Event" e
      LEFT JOIN "EventOrganizer" o ON o.id = e."organizerId"
      LEFT JOIN "Startup" st ON st.id = e."startupId" AND st."isVerified" = true AND st."deletedAt" IS NULL
      LEFT JOIN "EventSeries" ser ON ser.id = e."seriesId"
      WHERE e.slug = ${slug}
      LIMIT 1
    `;

    if (rows.length) {
      const event = rows[0];
      // Before registration a visitor may know the city, not the street address or map position, and never the
      // meeting link: that goes to confirmed attendees in their ticket email. This object is sent to the browser as
      // page data, so anything left on it is public whatever the screen shows. (The link used to stay here unless a
      // "reveal after registration" setting was on, and no screen lets a host turn that on, so every online event's
      // link was in its page source.)
      event.city = eventCity(event.address);
      delete event.address;
      delete event.latitude;
      delete event.longitude;
      delete event.meetingLink;
      // Soft-deleted → 410 Gone (handled via notFound for now)
      if (event.deletedAt) return { __gone: true };
      // Not published / not visible
      // Published events, and ones that already happened or changed plans: a completed event keeps its recap
      // page, and a cancelled or postponed one says so instead of a dead link. Drafts, reviews and archived don't show.
      if (!PUBLIC_STATUSES.includes(event.status) || !["PUBLIC", "UNLISTED"].includes(event.visibility)) return null;
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
      SELECT a.id, a."dayNumber", a."startTime", a."endTime", a.title, a.description, a."recordingUrl", a."slidesUrl", a.track,
             s.name AS "speakerName"
      FROM "EventAgendaItem" a
      LEFT JOIN "EventSpeaker" s ON s.id = a."speakerId"
      WHERE a."eventId" = ${eventId}
      ORDER BY a."dayNumber" ASC, a."startTime" ASC, a."sortOrder" ASC
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
      WHERE "eventId" = ${eventId} AND "hiddenAt" IS NULL
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
             to_char("startAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startAt", "venueName",
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

  // Search-friendly title: what, where and when ("HACK 6.0 — Hackathon in Hamirpur, 22 Jan 2027").
  const name = event.title.replace(/\s*\[[A-Z ]+\]\s*$/, "").trim(); // imported titles end in "[ONLINE]"
  const kind = String(event.category || "Event").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
  const place = event.format === "VIRTUAL" ? "Online" : String(event.city || event.venueName || "").split(",")[0].trim();
  const when = eventInstant(event.startAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: event.timezone || "Asia/Kolkata" });
  const where = place ? (place === "Online" ? " (Online)" : ` in ${place}`) : "";
  const built = `${name} — ${kind}${where}, ${when}`;
  const title = event.metaTitle || (built.length <= 70 ? built : `${name} — ${kind}, ${when}`);
  const bodyText = metaSnippet(descriptionText(event.description));
  // Imported events store a cut-off copy of the body as metaDescription ("…synthetic waves f"); only a
  // genuinely different, organizer-written one wins over the body text.
  const custom = metaSnippet(event.metaDescription || "");
  const isCustom = custom.length > 60 && !/^hosted by /i.test(custom) && !bodyText.startsWith(custom.slice(0, 40));
  const description =
    isCustom
      ? custom
      : bodyText.length > 60
        ? bodyText
        : `${name}: ${kind.toLowerCase()} ${place === "Online" ? "online" : place ? `in ${place}` : ""} on ${when}. See the agenda, speakers and how to register on Udyaibase.`.replace(/\s+/g, " ");
  const url = `https://udyaibase.com/events/${event.slug}`;
  const image = event.socialImageUrl || event.coverImageUrl || "/og-image.webp";

  return {
    title,
    description,
    alternates: { canonical: url },
    // A cancelled event's page stays for people with the link, but shouldn't be found in search.
    ...(event.status === "CANCELLED" ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
      url,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
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

  // Recap mode once a native event has ended: totals only, never who attended.
  let recap: React.ReactNode = null;
  if (!event.sourceUrl && event.endAt && new Date(event.endAt) < new Date()) {
    const stats = (await sql`
      SELECT
        (SELECT count(*)::int FROM "EventRegistration" r WHERE r."eventId" = ${event.id} AND r."checkedInAt" IS NOT NULL AND r."deletedAt" IS NULL) AS attended,
        (SELECT count(*)::int FROM "EventFeedback" f WHERE f."eventId" = ${event.id}) AS responses,
        (SELECT avg(f.rating)::float FROM "EventFeedback" f WHERE f."eventId" = ${event.id}) AS average
    `.catch(() => [])) as { attended: number; responses: number; average: number | null }[];
    const st = stats[0];
    recap = (
      <EventRecap
        summary={event.recapSummary ?? null}
        gallery={Array.isArray(event.galleryImageUrls) ? event.galleryImageUrls : []}
        links={cleanRecapLinks(event.recapLinks)}
        sessions={(agenda as any[]).map((a) => ({ id: a.id, title: a.title, dayNumber: a.dayNumber, startTime: a.startTime, recordingUrl: a.recordingUrl ?? null, slidesUrl: a.slidesUrl ?? null }))}
        attended={st && st.attended >= RECAP_MIN_ATTENDED ? st.attended : null}
        rating={st && st.responses >= RECAP_MIN_ATTENDED && st.average ? { average: st.average, responses: st.responses } : null}
      />
    );
  }

  // Call for speakers banner while proposals are open.
  const cfp = cfpSettings(event.cfpSettings);
  if (!event.sourceUrl && cfpIsOpen(cfp, { endAt: new Date(event.endAt), status: event.status, deletedAt: null })) {
    recap = (
      <>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-brand/30 bg-brand/5">
          <p className="flex-1 text-sm text-gray-800 dark:text-gray-200"><strong>Call for speakers is open.</strong> Have something to share? Propose a talk{cfp.closesAt ? ` by ${new Date(cfp.closesAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}` : ""}.</p>
          <Link href={`/events/${event.slug}/speak`} className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">Propose a talk</Link>
        </div>
        {recap}
      </>
    );
  }

  // Part of a series: link to every edition and the follow button.
  if (event.seriesSlug) {
    recap = (
      <>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <p className="flex-1 text-sm text-gray-800 dark:text-gray-200">Part of <strong>{event.seriesName}</strong>. Follow the series to hear when the next one opens.</p>
          <Link href={`/series/${event.seriesSlug}`} className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white">See the series</Link>
        </div>
        {recap}
      </>
    );
  }

  // Sponsors (Pro). A link exists when the sponsor has a website or a linked startup page.
  const sponsorRows = (event.sourceUrl ? [] : await sql`
    SELECT s.id, s.name, s.tier, s."logoUrl", (s."websiteUrl" IS NOT NULL OR st.slug IS NOT NULL) AS "hasLink"
    FROM "EventSponsor" s
    LEFT JOIN "Startup" st ON st.id = s."startupId" AND st."deletedAt" IS NULL
    WHERE s."eventId" = ${event.id}
    ORDER BY s."sortOrder" ASC
    LIMIT 30
  `.catch(() => [])) as { id: string; name: string; tier: string; logoUrl: string | null; hasLink: boolean }[];

  const eventUrl = `https://udyaibase.com/events/${event.slug}`;
  const schemaDescription = metaSnippet(descriptionText(event.description), 300) || event.subtitle || event.title;

  const eventSchema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": event.title,
    "description": schemaDescription,
    "startDate": event.startAt,
    "url": eventUrl,
    "eventStatus": event.status === "CANCELLED" ? "https://schema.org/EventCancelled" : event.status === "POSTPONED" ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
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
      "url": eventUrl,
    };
  } else if (event.venueName) {
    eventSchema.location = {
      "@type": "Place",
      "name": event.venueName,
      ...(event.city ? { "address": { "@type": "PostalAddress", "addressLocality": event.city } } : {}),
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
          // Editor HTML and rich-text documents both arrive as sanitized HTML.
          description: (() => {
            const html = descriptionHtml(event.description);
            return html ? { html: sanitizeHtml(html) } : event.description;
          })(),
        }}
        speakers={speakers as any}
        agenda={agenda as any}
        tags={tags as any}
        ticketTiers={ticketTiers as any}
        customQuestions={customQuestions as any}
        similarEvents={similarEvents as any}
        recap={recap}
        sponsors={sponsorRows.length ? <EventSponsors eventId={event.id} sponsors={sponsorRows} /> : null}
      />
    </>
  );
}

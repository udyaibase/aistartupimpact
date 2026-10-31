import { jsonLd } from "@/lib/json-ld";
import { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { sql } from "@/lib/db";
import { Calendar, ChevronRight, Bell } from "lucide-react";
import EventFilters, { EventSortDropdown } from "@/components/events/EventFilters";
import EventSearchBar from "@/components/events/EventSearchBar";
import EventListClient from "@/components/events/EventListClient";
import CreateEventButton from "@/components/events/CreateEventButton";
import SubscribeForm from "@/components/SubscribeForm";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "AI Events — Conferences, Hackathons & Meetups",
  description:
    "Discover upcoming AI events, conferences, hackathons, workshops, and meetups. Find events near you and register for free.",
  alternates: { canonical: "https://udyaibase.com/events" },
  openGraph: {
    title: "AI Events — Conferences, Hackathons & Meetups",
    description:
      "Discover upcoming AI events near you. Register for free conferences, hackathons, workshops, and meetups.",
    type: "website",
    url: "https://udyaibase.com/events",
  },
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    location?: string;
    category?: string;
    format?: string;
    timeframe?: string;
    sort?: string;
  }>;
}

async function getEvents(params: {
  q?: string;
  location?: string;
  category?: string;
  format?: string;
  timeframe?: string;
  sort?: string;
}) {
  try {
    const now = new Date().toISOString();
    const filterCategory = params.category && params.category !== 'all' ? params.category : null;
    const filterFormat = params.format && params.format !== 'all' ? params.format : null;
    const timeframe = params.timeframe || 'upcoming';
    const searchQuery = params.q?.trim() ? `%${params.q.trim()}%` : null;
    const locationQuery = params.location?.trim() ? `%${params.location.trim()}%` : null;
    const sortBy = params.sort || 'soonest';

    const rows = await sql`
      SELECT
        e.id, e.title, e.slug, e.subtitle, e.category, e.format,
        e."startAt"::text AS "startAt", e."endAt"::text AS "endAt",
        e."venueName", e.address, e.latitude, e.longitude,
        e."coverImageUrl", e."registrationCount", e.capacity,
        e.timezone, e."sourceUrl", e."sourceName",
        o.name AS "organizerName", o.avatar AS "organizerAvatar",
        (e."featuredUntil" IS NOT NULL AND e."featuredUntil" > NOW() AND e."endAt" > NOW()) AS featured
      FROM "Event" e
      LEFT JOIN "EventOrganizer" o ON o.id = e."organizerId"
      WHERE e.status = 'PUBLISHED'
        AND e."deletedAt" IS NULL
        AND e.visibility = 'PUBLIC'
        ${filterCategory ? sql`AND e.category = ${filterCategory}::"EventCategory"` : sql``}
        ${filterFormat ? sql`AND e.format = ${filterFormat}::"EventFormat"` : sql``}
        ${timeframe === "upcoming" ? sql`AND e."startAt" >= ${now}::timestamp` : sql``}
        ${timeframe === "past" ? sql`AND e."endAt" < ${now}::timestamp` : sql``}
        ${timeframe === "this_week" ? sql`AND e."startAt" >= ${now}::timestamp AND e."startAt" < (${now}::timestamp + interval '7 days')` : sql``}
        ${timeframe === "today" ? sql`AND DATE(e."startAt") = DATE(${now}::timestamp)` : sql``}
        ${searchQuery ? sql`AND (e.title ILIKE ${searchQuery} OR e.subtitle ILIKE ${searchQuery} OR e."venueName" ILIKE ${searchQuery} OR o.name ILIKE ${searchQuery})` : sql``}
        ${locationQuery ? sql`AND (e.address ILIKE ${locationQuery} OR e."venueName" ILIKE ${locationQuery} OR (${locationQuery} ILIKE '%online%' AND e.format = 'VIRTUAL') OR (${locationQuery} ILIKE '%virtual%' AND e.format = 'VIRTUAL'))` : sql``}
      ORDER BY
        ${timeframe === 'past'
          ? sql`e."startAt" DESC`
          : sortBy === 'popular'
            ? sql`(e."featuredUntil" > NOW() AND e."endAt" > NOW()) DESC NULLS LAST, e."registrationCount" DESC NULLS LAST`
            : sortBy === 'newest'
              ? sql`e.id DESC`
              : sql`CASE WHEN e."featuredUntil" > NOW() AND e."endAt" > NOW() THEN 0 ELSE 1 END ASC, CASE WHEN e."startAt" >= ${now}::timestamp THEN 0 ELSE 1 END ASC, e."startAt" ASC`
        }
      LIMIT 100
    `;

    return rows;
  } catch (e) {
    console.error("getEvents error:", e);
    return [];
  }
}

async function getEventCount() {
  try {
    const now = new Date().toISOString();
    const rows = await sql`
      SELECT COUNT(*)::int AS total
      FROM "Event" e
      WHERE e.status = 'PUBLISHED' AND e."deletedAt" IS NULL AND e.visibility = 'PUBLIC'
        AND e."startAt" >= ${now}::timestamp
    `;
    return (rows[0] as any)?.total || 0;
  } catch {
    return 0;
  }
}

export default async function EventsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const { q, location: locationFilter, category, format, timeframe, sort } = searchParams;

  const [events, totalUpcoming] = await Promise.all([
    getEvents({ ...searchParams, location: locationFilter }),
    getEventCount(),
  ]);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
      { '@type': 'ListItem', position: 2, name: 'AI Events', item: 'https://udyaibase.com/events' },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 dark:text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand transition-colors">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">AI Events</span>
      </nav>

      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            AI Events
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-1">
            {totalUpcoming > 0 ? `${totalUpcoming}` : ''} upcoming conferences, hackathons, workshops & meetups. Updated daily.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="#event-alert"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:border-gray-400 transition-colors"
          >
            <Bell className="w-4 h-4" />
            Event alerts
          </a>
          <CreateEventButton />
        </div>
      </div>

      {/* Search bar */}
      <Suspense fallback={<div className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />}>
        <EventSearchBar initialQuery={q} initialLocation={locationFilter} />
      </Suspense>

      {/* Main layout: sidebar + events */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 mt-6">
        {/* Filters (desktop sidebar + mobile bar/sheet) */}
        <Suspense fallback={null}>
          <EventFilters
            currentCategory={category}
            currentFormat={format}
            currentTimeframe={timeframe}
            currentSort={sort}
            total={events.length}
          />
        </Suspense>

        {/* Event listings */}
        <div className="flex-1 min-w-0">
          {/* Count + sort — desktop */}
          <div className="hidden lg:flex items-center justify-between mb-4">
            <p className="font-sora font-bold text-sm text-navy dark:text-white">
              {events.length} <span className="font-normal text-gray-500 dark:text-gray-400 font-jakarta">{events.length === 1 ? 'event' : 'events'}</span>
            </p>
            <Suspense fallback={null}>
              <EventSortDropdown currentSort={sort} />
            </Suspense>
          </div>

          {/* Event cards */}
          {events.length === 0 ? (
            <div className="card p-10 text-center">
              <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">No events found</h2>
              <p className="text-sm text-gray-500 font-jakarta mb-4">
                Try adjusting your filters or search query.
              </p>
            </div>
          ) : (
            <EventListClient events={events as any} total={events.length} />
          )}

          {/* Event Alert CTA */}
          <div id="event-alert" className="mt-10 rounded-xl bg-gray-900 dark:bg-gray-800 px-6 py-4 sm:px-8 sm:py-5 scroll-mt-24">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="shrink-0">
                <h2 className="font-sora font-bold text-base text-white">
                  Never miss an AI event
                </h2>
                <p className="text-sm text-gray-400 font-jakarta mt-0.5">
                  Get notified about new conferences, hackathons & meetups in your inbox.
                </p>
              </div>
              <div className="sm:flex-1 sm:max-w-md">
                <SubscribeForm source="events-alert" buttonText="Subscribe" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

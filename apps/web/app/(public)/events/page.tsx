import { jsonLd } from "@/lib/json-ld";
import { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { sql } from "@/lib/db";
import { ChevronRight, Bell } from "lucide-react";
import EventSearchBar from "@/components/events/EventSearchBar";
import EventsBrowser from "@/components/events/EventsBrowser";
import { searchEvents } from "@/lib/events/search";
import CreateEventButton from "@/components/events/CreateEventButton";
import SubscribeForm from "@/components/SubscribeForm";

// Organizer and admin edits refresh this page on demand (lib/revalidate.ts); the timer is a fallback.
export const revalidate = 300;

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

// Rendered without the URL's filters so the page can be cached; EventsBrowser applies them after load.
export default async function EventsPage() {
  const [events, totalUpcoming] = await Promise.all([
    searchEvents({}).catch((e) => {
      console.error("events list error:", e);
      return [];
    }),
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
        <EventSearchBar />
      </Suspense>

      {/* Main layout: sidebar + events */}
      <EventsBrowser initialEvents={events as any}>
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
      </EventsBrowser>
    </div>
  );
}

import { getOrganizerSession } from "@/lib/organizer-auth";
import { prisma } from "@udyaibase/database";
import Image from "next/image";
import Link from "next/link";
import { Plus, Calendar, Users, MapPin } from "lucide-react";
import EventActions from "./EventActions";
import PublishedModal from "@/components/organizer/embed/PublishedModal";

export const dynamic = "force-dynamic";

export default async function OrganizerEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) return null;
  const { published } = await searchParams;

  const events = await prisma.event.findMany({
    where: { organizerId: session.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, slug: true, shortCode: true, status: true, category: true,
      format: true, startAt: true, registrationCount: true, capacity: true,
      coverImageUrl: true, venueName: true,
    },
  });

  const publishedEvent = published ? events.find((e) => e.id === published && e.status === "PUBLISHED") : undefined;
  const liveWidget = publishedEvent
    ? await prisma.embedWidget.findFirst({
        where: { organizerId: session.id, active: true, firstSeenAt: { not: null } },
        select: { firstSeenHost: true },
      })
    : null;

  return (
    <div className="space-y-6">
      {publishedEvent && (
        <PublishedModal
          event={{ id: publishedEvent.id, title: publishedEvent.title, slug: publishedEvent.slug, shortCode: publishedEvent.shortCode }}
          liveHost={liveWidget?.firstSeenHost?.replace(/^www\./, "") ?? null}
        />
      )}
      <div className="flex items-center justify-between">
        <h1 className="portal-title">My Events</h1>
        <Link data-tour="create-event" href="/organizer/events/create" className="inline-flex items-center gap-1.5 min-h-[44px] px-4 bg-brand hover:bg-brand-600 active:bg-brand-700 text-white text-sm font-bold font-jakarta rounded-lg">
          <Plus className="w-4 h-4" /> Create Event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-jakarta mb-4">No events yet.</p>
          <Link href="/organizer/events/create" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white font-bold font-jakarta text-sm rounded-xl">
            <Plus className="w-4 h-4" /> Create Your First Event
          </Link>
        </div>
      ) : (
        <div data-tour="events-list" className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4 hover:border-brand/20 transition-all">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Thumbnail */}
                <div className="hidden min-[400px]:block w-16 sm:w-20 h-10 sm:h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0" style={{ aspectRatio: "16/9" }}>
                  {event.coverImageUrl ? (
                    <Image src={event.coverImageUrl} alt="" width={80} height={48} sizes="80px" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Calendar className="w-4 h-4 text-gray-300" /></div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 min-w-0">
                    <Link href={`/organizer/events/${event.id}`} className="min-w-0 truncate font-sora font-bold text-sm text-navy dark:text-white hover:underline">
                      {event.title}
                    </Link>
                    <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      event.status === "PUBLISHED" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      event.status === "CANCELLED" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                      event.status === "POSTPONED" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      event.status === "COMPLETED" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      event.status === "ARCHIVED" ? "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400" :
                      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 font-jakarta">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(event.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {event.venueName && (
                      <span className="flex items-center gap-1 min-w-0 max-w-[12rem] truncate"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{event.venueName}</span></span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />{event.registrationCount}{event.capacity && ` / ${event.capacity}`}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <EventActions eventId={event.id} eventSlug={event.slug} eventTitle={event.title} shortCode={event.shortCode} status={event.status} registrationCount={event.registrationCount} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

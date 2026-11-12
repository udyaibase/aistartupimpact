'use client';

import { useState, useMemo, useEffect } from 'react';
import IntentLink from '@/components/IntentLink';
import { Calendar, MapPin, Video, Users, Clock, ExternalLink, BadgeCheck } from 'lucide-react';

const PAGE_SIZE = 15;

interface Event {
  id: string;
  title: string;
  slug: string;
  subtitle?: string;
  category: string;
  format: string;
  startAt: string;
  endAt: string;
  venueName?: string;
  address?: string;
  coverImageUrl?: string;
  registrationCount: number;
  capacity?: number;
  timezone: string;
  organizerName?: string;
  /** Set only while the tagged startup is verified. */
  hostStartupName?: string | null;
  organizerAvatar?: string;
  sourceUrl?: string;
  sourceName?: string;
  /** Paid placement (Event Boost or Pro). */
  featured?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  CONFERENCE: 'bg-blue-600',
  HACKATHON: 'bg-purple-600',
  SUMMIT: 'bg-amber-600',
  WORKSHOP: 'bg-green-600',
  MEETUP: 'bg-teal-600',
  DEMO_DAY: 'bg-red-600',
  WEBINAR: 'bg-indigo-600',
  NETWORKING: 'bg-pink-600',
};

function formatCategory(cat: string) {
  return cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Whole calendar days from `from` to `to` in the viewer's timezone (11th 11pm → 12th 1am is 1 day). */
function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * "Live Now", "In 3h", "Today" or "Tomorrow", by calendar day in the viewer's timezone. It used to count 24-hour
 * blocks, so an event at 1am two days away (36 hours) showed as "Tomorrow".
 */
export function getRelativeLabel(dateStr: string, now: Date): string {
  const d = new Date(dateStr);
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return diffMs > -3 * 60 * 60 * 1000 ? 'Live Now' : '';
  const days = calendarDaysBetween(now, d);
  if (days === 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    return hours >= 1 ? `In ${hours}h` : 'Today';
  }
  return days === 1 ? 'Tomorrow' : '';
}

/**
 * The current time, only in the browser: the list HTML is cached on the server (UTC, built minutes earlier), so
 * labels are worked out after the page loads, in the viewer's timezone, and kept fresh every minute.
 */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function extractCity(address: string): string {
  if (!address) return '';
  const cleaned = address.replace(/https?:\/\/[^\s,|]+/g, '').replace(/\|\|/g, ',');
  const noCoords = cleaned.replace(/\b\d+\.\d{4,}\b/g, '');
  const parts = noCoords.split(/[,|]/).map(s => s.trim()).filter(s => s.length > 2 && !/^\d+$/.test(s));
  return parts[0] || '';
}

function EventCard({ event, now }: { event: Event; now: Date | null }) {
  const isFull = event.capacity ? event.registrationCount >= event.capacity : false;
  const fewSpots = event.capacity ? (event.capacity - event.registrationCount) <= 10 && !isFull : false;
  const relLabel = now ? getRelativeLabel(event.startAt, now) : '';
  const city = extractCity(event.address || event.venueName || '');
  const catColor = CATEGORY_COLORS[event.category] || 'bg-gray-600';

  const isExternal = !!event.sourceUrl;
  const displayOrganizer = isExternal
    ? (event.subtitle?.startsWith('Hosted by ') ? event.subtitle.replace('Hosted by ', '') : null)
    : event.hostStartupName || event.organizerName;

  return (
    <IntentLink href={`/events/${event.slug}`} className="block card p-4 sm:p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group cursor-pointer">
      <div className="flex gap-3 sm:gap-4">
        {/* Date block */}
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg flex flex-col items-center justify-center shrink-0 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="text-[10px] font-bold font-jakarta text-brand uppercase leading-none">
            {new Date(event.startAt).toLocaleDateString('en-US', { month: 'short' })}
          </span>
          <span className="text-lg font-sora font-extrabold text-navy dark:text-white leading-none mt-0.5">
            {new Date(event.startAt).getDate()}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white group-hover:text-brand transition-colors line-clamp-2">
                {event.title}
              </span>
              {(displayOrganizer || isExternal) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
                  {displayOrganizer ? `By ${displayOrganizer}` : ''}
                  {event.hostStartupName && <BadgeCheck className="inline w-3.5 h-3.5 ml-1 -mt-0.5 text-blue-600" aria-label="Verified startup" />}
                  {isExternal && event.sourceName ? <span className="text-gray-400 dark:text-gray-500">{displayOrganizer ? ' · ' : ''}via {event.sourceName}</span> : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {event.featured && (
                <span className="text-[10px] font-bold font-jakarta px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">Featured</span>
              )}
              {relLabel && (
                <span className={`text-[10px] font-bold font-jakarta px-2 py-0.5 rounded ${relLabel === 'Live Now' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
                  {relLabel}
                </span>
              )}
            </div>
          </div>

          {/* Meta info - desktop */}
          <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400 font-jakarta">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(event.startAt)} · {formatTime(event.startAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              {event.format === 'VIRTUAL' ? (
                <><Video className="w-3 h-3" /> Online</>
              ) : (
                <><MapPin className="w-3 h-3" /> {city || 'In Person'}</>
              )}
            </span>
            {event.registrationCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {event.registrationCount} registered
              </span>
            )}
          </div>

          {/* Meta info - mobile */}
          <div className="flex sm:hidden flex-wrap gap-1.5 mt-2">
            <span className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-md">
              {formatDate(event.startAt)}
            </span>
            <span className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-md">
              {event.format === 'VIRTUAL' ? 'Online' : city || 'In Person'}
            </span>
          </div>

          {/* Badges */}
          <div className="hidden sm:flex flex-wrap gap-1.5 mt-2.5">
            <span className={`text-[11px] font-jakarta text-white px-2.5 py-0.5 rounded-md ${catColor}`}>
              {formatCategory(event.category)}
            </span>
            <span className="text-[11px] font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-700">
              {event.format === 'IN_PERSON' ? 'In Person' : event.format === 'VIRTUAL' ? 'Virtual' : 'Hybrid'}
            </span>
            {isFull && (
              <span className="text-[11px] font-jakarta font-semibold bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2.5 py-0.5 rounded-md">
                Sold Out
              </span>
            )}
            {fewSpots && (
              <span className="text-[11px] font-jakarta font-semibold bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2.5 py-0.5 rounded-md">
                Few Spots Left
              </span>
            )}
            {!isFull && !fewSpots && (
              <span className="text-[11px] font-jakarta bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2.5 py-0.5 rounded-md">
                Free
              </span>
            )}
          </div>

          {/* Bottom row - desktop */}
          <div className="hidden sm:flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2">
              <span className="px-5 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 transition-colors">
                View details
              </span>
              {isExternal ? (
                <span
                  role="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(event.sourceUrl!, '_blank', 'noopener'); }}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold font-jakarta hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Register on {event.sourceName || 'Source'} <ExternalLink className="w-3.5 h-3.5" />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold font-jakarta group-hover:bg-gray-800 dark:group-hover:bg-gray-100 transition-colors">
                  Register <ExternalLink className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta">
              {isExternal ? 'External event' : event.capacity ? `${event.capacity - event.registrationCount} spots left` : 'Open registration'}
            </span>
          </div>

          {/* Bottom row - mobile */}
          <div className="flex sm:hidden items-center justify-between mt-2.5">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta">
              {event.registrationCount > 0 ? `${event.registrationCount} going` : ''}
            </span>
            <span className="text-[11px] font-semibold font-jakarta text-brand">
              {formatTime(event.startAt)}
            </span>
          </div>
        </div>

        {/* Cover image */}
        {event.coverImageUrl && (
          <div className="hidden sm:block shrink-0 self-center">
            <div className="w-[140px] h-[140px] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.coverImageUrl}
                alt={`${event.title} cover image`}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          </div>
        )}
      </div>
    </IntentLink>
  );
}

interface EventListClientProps {
  events: Event[];
  total: number;
}

export default function EventListClient({ events, total }: EventListClientProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const now = useNow();
  const visibleEvents = useMemo(() => events.slice(0, visibleCount), [events, visibleCount]);
  const hasMore = visibleCount < events.length;

  return (
    <>
      <div className="space-y-3">
        {visibleEvents.map((event) => (
          <EventCard key={event.id} event={event} now={now} />
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            className="px-8 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Show more events
          </button>
          <p className="text-xs text-gray-400 font-jakarta mt-2">
            Showing {visibleEvents.length} of {total} events
          </p>
        </div>
      )}

      {!hasMore && events.length > PAGE_SIZE && (
        <p className="text-center text-xs text-gray-400 font-jakarta mt-6">
          Showing all {events.length} events
        </p>
      )}
    </>
  );
}

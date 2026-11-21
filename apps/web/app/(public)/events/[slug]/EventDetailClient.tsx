"use client";

import { eventInstant } from '@/lib/events/zoned-time';
import { useEffect, useRef, useState } from "react";
import { eventPriceLabel } from '@/lib/events/price-label';
import Link from "next/link";
import Image from "next/image";
import ScheduleView from "@/components/events/ScheduleView";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Users,
  Tag,
  User,
  ChevronRight,
  Globe,
  ExternalLink,
  BadgeCheck,
} from "lucide-react";
import RegistrationModal from "./RegistrationModal";
import ShareMenu from "@/components/shared/ShareMenu";
import BookmarkButton from "@/components/BookmarkButton";
import ReportButton from "@/components/shared/ReportButton";
import { EVENT_REPORT_REASONS } from "@/lib/events/report-reasons";
import { descriptionHtml, descriptionText } from "@/lib/events/description";

interface Event {
  id: string;
  slug: string;
  /** PUBLISHED, or COMPLETED / POSTPONED / CANCELLED (the page stays up so old links still explain what happened). */
  status?: string;
  shortCode?: string;
  title: string;
  subtitle?: string;
  category: string;
  format: string;
  startAt: string;
  endAt: string;
  timezone: string;
  venueName?: string;
  /** The city only: the street address is for people who have registered. */
  city?: string;
  revealLinkAfterRegistration: boolean;
  coverImageUrl?: string;
  galleryImageUrls: string[];
  description?: any;
  sourceUrl?: string;
  sourceName?: string;
  capacity?: number;
  registrationCount: number;
  registrationDeadline?: string;
  approvalRequired: boolean;
  organizerName?: string;
  organizerVerified?: boolean;
  /** Set only while the tagged startup is verified. */
  hostStartupName?: string | null;
  hostStartupSlug?: string | null;
  organizerAvatar?: string;
}

interface Speaker {
  id: string;
  name: string;
  title?: string;
  company?: string;
  headshotUrl?: string;
  bio?: string;
  talkTitle?: string;
}

interface AgendaItem {
  id: string;
  dayNumber: number;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  speakerName?: string;
  track?: string | null;
  recordingUrl?: string | null;
  slidesUrl?: string | null;
}

interface EventTag {
  name: string;
  canonicalName: string;
}

interface TicketTier {
  id: string;
  name: string;
  priceCents: number;
  quantity?: number;
  soldCount: number;
  tierType: string;
  description?: string;
}

interface CustomQuestion {
  id: string;
  questionText: string;
  questionType: string;
  options?: string[];
  required: boolean;
}

interface SimilarEvent {
  id: string;
  title: string;
  slug: string;
  category: string;
  format: string;
  startAt: string;
  venueName?: string;
  coverImageUrl?: string;
  registrationCount: number;
}

interface Props {
  event: Event;
  speakers: Speaker[];
  agenda: AgendaItem[];
  tags: EventTag[];
  ticketTiers: TicketTier[];
  customQuestions: CustomQuestion[];
  similarEvents: SimilarEvent[];
  /** After the event: highlights, photos, recordings (rendered on the server). */
  recap?: React.ReactNode;
  sponsors?: React.ReactNode;
}

/** Dates and times in the event's own time zone (never the server's or the visitor's). */
function safeZone(timezone?: string) {
  try { new Intl.DateTimeFormat("en-IN", { timeZone: timezone || "Asia/Kolkata" }); return timezone || "Asia/Kolkata"; } catch { return "Asia/Kolkata"; }
}

function formatDate(dateStr: string, timezone?: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: safeZone(timezone) }).format(eventInstant(dateStr));
}

function formatTime(dateStr: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: safeZone(timezone) }).format(eventInstant(dateStr));
}

function isUpcoming(dateStr: string) {
  return eventInstant(dateStr) > new Date();
}

function isRegistrationOpen(event: Event) {
  if (event.status && event.status !== "PUBLISHED") return false;
  if (!isUpcoming(event.startAt)) return false;
  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) return false;
  if (event.capacity && event.registrationCount >= event.capacity) return false;
  return true;
}

export default function EventDetailClient({
  event,
  speakers,
  agenda,
  tags,
  ticketTiers,
  customQuestions,
  similarEvents,
  recap,
  sponsors,
}: Props) {
  const [showRegistration, setShowRegistration] = useState(false);

  const upcoming = isUpcoming(event.startAt);
  const regOpen = isRegistrationOpen(event);
  const spotsLeft = event.capacity ? event.capacity - event.registrationCount : null;
  const isFull = event.capacity ? event.registrationCount >= event.capacity : false;

  const price = eventPriceLabel(ticketTiers.map((t) => t.priceCents));
  const registerLabel = price.free ? "Register Now — Free" : "Get tickets";

  // On phones the main Register button sits below the details. Until it scrolls into view, a bar at the bottom
  // of the screen carries the price and the button.
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaInView, setCtaInView] = useState(false);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setCtaInView(entry.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const showStickyBar = !ctaInView && !showRegistration && (event.sourceUrl ? true : regOpen);

  const eventUrl = event.shortCode
    ? `https://udyaibase.com/e/${event.shortCode}`
    : `https://udyaibase.com/events/${event.slug}`;


  return (
    <div className="max-w-5xl mx-auto px-6 sm:px-10 lg:px-16 py-6 sm:py-8 pb-24 md:pb-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 dark:text-gray-500 mb-3 md:mb-5">
        <Link href="/" className="hover:text-brand transition-colors inline-flex items-center min-h-11 md:min-h-0">Home</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <Link href="/events" className="hover:text-brand transition-colors inline-flex items-center min-h-11 md:min-h-0">AI Events</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[250px]">{event.title}</span>
      </nav>

      {/* ─── Top: Image+Host Left | Details+CTA Right ─── */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-6 md:gap-8 mb-8">
        {/* Left: Image + Host (3 cols) */}
        <div className="md:col-span-3 space-y-3">
          {/* Cover image, square. Without one: a slim band, so the title and Register aren't pushed down by an empty box. */}
          <div className={`rounded-xl overflow-hidden bg-gradient-to-br from-brand/5 to-brand/10 relative ${event.coverImageUrl ? "aspect-square" : "h-16 md:h-28"}`}>
            {event.coverImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={event.coverImageUrl}
                alt={event.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-end pr-4">
                <Calendar className="w-7 h-7 md:w-9 md:h-9 text-brand/20" aria-hidden />
              </div>
            )}
            <div className={`absolute left-3 flex gap-1.5 ${event.coverImageUrl ? "top-3" : "top-1/2 -translate-y-1/2"}`}>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/90 backdrop-blur-sm text-brand px-2 py-0.5 rounded-full">{event.category.replace(/_/g, " ")}</span>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/90 backdrop-blur-sm text-navy px-2 py-0.5 rounded-full">{event.format.replace(/_/g, " ")}</span>
            </div>
          </div>

          {/* Host */}
          {(() => {
            const isExternal = !!event.sourceUrl;
            const displayOrganizer = isExternal
              ? (event.subtitle?.startsWith('Hosted by ') ? event.subtitle.replace('Hosted by ', '') : null)
              : event.hostStartupName || event.organizerName;
            return (displayOrganizer || isExternal) ? (
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center shrink-0 shadow-sm">
                  {event.organizerAvatar && !isExternal ? (
                    <Image src={event.organizerAvatar} alt="" width={32} height={32} sizes="32px" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <Globe className="w-4 h-4 text-white" />
                  )}
                </div>
                <div>
                  {displayOrganizer ? (
                    <>
                      <p className="text-xs text-gray-400 font-jakarta leading-none">Hosted by</p>
                      <p className="text-sm font-semibold text-navy dark:text-white font-jakarta">
                        {event.hostStartupSlug ? <Link href={`/startups/${event.hostStartupSlug}`} className="hover:underline">{displayOrganizer}</Link> : displayOrganizer}
                        {event.hostStartupName && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300"><BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Verified startup</span>}
                        {!event.hostStartupName && event.organizerVerified && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-green-700 dark:text-green-400"><BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Verified organizer</span>}
                      </p>
                    </>
                  ) : null}
                  {isExternal && event.sourceName && (
                    <p className={`text-${displayOrganizer ? '[10px]' : 'xs'} text-gray-400 font-jakarta`}>
                      {displayOrganizer ? 'via' : 'Listed from'} {event.sourceName}
                    </p>
                  )}
                </div>
              </div>
            ) : null;
          })()}
        </div>

        {/* Right: All details + CTA (4 cols) */}
        <div className="md:col-span-4 flex flex-col">
          {(event.status === "CANCELLED" || event.status === "POSTPONED") && (
            <p role="status" className={`mb-3 rounded-xl border px-3 py-2 text-sm font-medium ${event.status === "CANCELLED" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"}`}>
              {event.status === "CANCELLED"
                ? "This event was cancelled. Registered attendees were emailed, and paid tickets are refunded."
                : "This event is postponed. The host will share the new date; registration is paused until then."}
            </p>
          )}
          {/* Title */}
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h1 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white leading-tight">
              {event.title}
            </h1>
            <BookmarkButton type="event" itemId={event.slug} itemName={event.title} className="shrink-0 min-w-11 min-h-11 md:min-w-0 md:min-h-0" />
          </div>
          {event.subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mb-4">{event.subtitle}</p>
          )}

          {/* Meta details */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
              <Calendar className="w-4 h-4 text-brand shrink-0" />
              <span>{formatDate(event.startAt, event.timezone)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
              <Clock className="w-4 h-4 text-brand shrink-0" />
              <span>{formatTime(event.startAt, event.timezone)} – {formatTime(event.endAt, event.timezone)}</span>
              <span className="text-xs text-gray-400">({event.timezone.split("/")[1]})</span>
            </div>
            {event.venueName && (
              <div className="flex items-center gap-2 text-sm font-jakarta">
                <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300">{event.city ? `${event.city} · ` : ""}<span className="text-gray-400 italic">full address after you register</span></span>
              </div>
            )}
            {event.format === "VIRTUAL" && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
                <Video className="w-4 h-4 text-purple-500 shrink-0" />
                <span>Online Event</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-500 font-jakarta">
              <Users className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{event.registrationCount} going{spotsLeft !== null && spotsLeft > 0 && <span className="text-green-600 font-medium"> · {spotsLeft} spots left</span>}</span>
            </div>
          </div>

          {/* Description (4 lines + see more) */}
          <DescriptionSection description={event.description} />

          {/* Speakers inline */}
          {speakers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase text-gray-400 font-jakarta mb-2">Speakers</p>
              <div className="flex flex-wrap gap-2">
                {speakers.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {s.headshotUrl ? <Image src={s.headshotUrl} alt={s.name} width={28} height={28} sizes="28px" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-brand">{s.name.charAt(0)}</span>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{s.name}</p>
                      {s.title && <p className="text-xs text-gray-400">{s.title}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Register CTA */}
          <div ref={ctaRef} className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            {event.sourceUrl ? (
              <>
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl transition-colors shadow-lg shadow-brand/20 flex items-center justify-center gap-2"
                >
                  Register on {event.sourceName || 'Source'} <ExternalLink className="w-4 h-4" />
                </a>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta text-center">
                  This event is hosted externally{event.sourceName ? ` on ${event.sourceName}` : ''}. Registration is managed by the organizer.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-sora font-bold text-navy dark:text-white">{price.label}</span>
                  {event.registrationDeadline && (
                    <span className="text-xs text-gray-400 font-jakarta">Closes {eventInstant(event.registrationDeadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: safeZone(event.timezone) })}</span>
                  )}
                </div>
                {regOpen ? (
                  <button onClick={() => setShowRegistration(true)} className="w-full py-3 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl transition-colors shadow-lg shadow-brand/20">
                    {registerLabel}
                  </button>
                ) : isFull ? (
                  <button disabled className="w-full py-3 bg-gray-200 dark:bg-gray-700 text-gray-500 font-bold font-jakarta text-sm rounded-xl cursor-not-allowed">Event Full</button>
                ) : (
                  <button disabled className="w-full py-3 bg-gray-200 dark:bg-gray-700 text-gray-500 font-bold font-jakarta text-sm rounded-xl cursor-not-allowed">Registration Closed</button>
                )}
              </>
            )}
            <ShareMenu
              url={eventUrl}
              title={`${event.title} — Udyaibase Events`}
              utmCampaign="event_share"
              variant="button"
              buttonLabel="Share Event"
              entityType="EVENT"
              entityId={event.id}
            />
            {!event.sourceUrl && (
              <div className="text-center">
                <ReportButton endpoint={`/api/events/${encodeURIComponent(event.slug)}/report`} title={event.title} noun="event" reasons={EVENT_REPORT_REASONS}
                  note="Legitimate hosts never ask for payment outside the registration page." />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Below-fold: Agenda, Tags, Similar ─── */}
      <div className="space-y-8 max-w-4xl mt-8">
          {recap}
          {/* Agenda */}
          {agenda.length > 0 && (
            <ScheduleView
              sessions={agenda}
              tracks={Array.isArray((event as { agendaTracks?: unknown }).agendaTracks) ? ((event as { agendaTracks?: string[] }).agendaTracks ?? []) : []}
              event={{ slug: event.slug, title: event.title, startAt: event.startAt, timezone: event.timezone, location: event.format === "VIRTUAL" ? "Online" : [event.venueName, event.city].filter(Boolean).join(", "), ended: new Date(event.endAt) < new Date() }}
            />
          )}

          {sponsors}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="w-4 h-4 text-gray-400" />
              {tags.map((tag) => (
                <span
                  key={tag.canonicalName}
                  className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 rounded-full font-jakarta font-medium"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Similar Events */}
          {similarEvents.length > 0 && (
            <div>
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">
                Similar Events
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {similarEvents.map((se) => (
                  <Link
                    key={se.id}
                    href={`/events/${se.slug}`}
                    className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-brand/30 transition-colors"
                  >
                    <p className="text-xs text-brand font-bold uppercase font-jakarta mb-1">
                      {se.category.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm font-sora font-bold text-navy dark:text-white group-hover:text-brand transition-colors line-clamp-2">
                      {se.title}
                    </p>
                    <p className="text-xs text-gray-400 font-jakarta mt-2">
                      {eventInstant(se.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: safeZone(event.timezone) })}
                      {se.venueName && ` · ${se.venueName}`}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* ─── Phones: price and Register, until the main button is on screen. Sits above the bottom menu and, on a
          first visit, above the cookie banner (which reports its height in --cookie-banner-space). ─── */}
      {showStickyBar && (
        <div
          data-sticky-register
          className="md:hidden fixed inset-x-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-2 flex items-center gap-3 shadow-[0_-4px_16px_rgba(13,27,42,0.08)]"
          style={{ bottom: "calc(4.0625rem + env(safe-area-inset-bottom, 0px) + var(--cookie-banner-space, 0px))" }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-sora font-bold text-navy dark:text-white truncate">{event.sourceUrl ? (event.sourceName || "External event") : price.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta truncate">{formatDate(event.startAt, event.timezone).replace(/^\w+, /, "")} · {formatTime(event.startAt, event.timezone)}</p>
          </div>
          {event.sourceUrl ? (
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center justify-center gap-1.5 h-11 px-5 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl">
              Register <ExternalLink className="w-4 h-4" aria-hidden />
            </a>
          ) : (
            <button type="button" onClick={() => setShowRegistration(true)} className="shrink-0 h-11 px-6 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl">
              {price.free ? "Register" : "Get tickets"}
            </button>
          )}
        </div>
      )}

      {/* ─── Registration Modal ─── */}
      {showRegistration && (
        <RegistrationModal
          event={event}
          customQuestions={customQuestions}
          ticketTiers={ticketTiers}
          onClose={() => setShowRegistration(false)}
        />
      )}
    </div>
  );
}

// ─── Description with "See more" ───
function DescriptionSection({ description }: { description: any }) {
  const [expanded, setExpanded] = useState(false);

  if (!description) return null;

  // Plain text, editor HTML, or a rich-text document from imported events (see lib/events/description).
  const html = descriptionHtml(description);
  const text = html ? "" : descriptionText(description);

  if (!html && !text) return null;

  const isLong = html ? html.length > 500 : (text.split("\n").length > 4 || text.length > 300);

  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase text-gray-400 font-jakarta mb-1.5">About</p>
      {html ? (
        <div
          className={`prose prose-sm dark:prose-invert max-w-none font-jakarta ${!expanded ? "line-clamp-4" : ""}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className={`text-sm text-gray-600 dark:text-gray-300 font-jakarta whitespace-pre-wrap leading-relaxed ${!expanded ? "line-clamp-4" : ""}`}>
          {text}
        </div>
      )}
      {isLong ? (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-brand font-semibold font-jakarta mt-1.5 hover:underline min-h-11 md:min-h-0 inline-flex items-center"
        >
          {expanded ? "Show less" : "See more"}
        </button>
      ) : null}
    </div>
  );
}

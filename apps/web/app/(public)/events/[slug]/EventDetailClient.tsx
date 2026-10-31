"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
} from "lucide-react";
import RegistrationModal from "./RegistrationModal";
import ShareMenu from "@/components/shared/ShareMenu";

interface Event {
  id: string;
  slug: string;
  shortCode?: string;
  title: string;
  subtitle?: string;
  category: string;
  format: string;
  startAt: string;
  endAt: string;
  timezone: string;
  venueName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  meetingLink?: string;
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
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(dateStr: string, timezone: string) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

function isUpcoming(dateStr: string) {
  return new Date(dateStr) > new Date();
}

function isRegistrationOpen(event: Event) {
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
}: Props) {
  const [showRegistration, setShowRegistration] = useState(false);

  const upcoming = isUpcoming(event.startAt);
  const regOpen = isRegistrationOpen(event);
  const spotsLeft = event.capacity ? event.capacity - event.registrationCount : null;
  const isFull = event.capacity ? event.registrationCount >= event.capacity : false;

  const eventUrl = event.shortCode
    ? `https://udyaibase.com/e/${event.shortCode}`
    : `https://udyaibase.com/events/${event.slug}`;

  // Group agenda by day
  const agendaByDay = agenda.reduce((acc, item) => {
    const day = item.dayNumber;
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {} as Record<number, AgendaItem[]>);

  return (
    <div className="max-w-5xl mx-auto px-6 sm:px-10 lg:px-16 py-6 sm:py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 dark:text-gray-500 mb-5">
        <Link href="/" className="hover:text-brand transition-colors">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/events" className="hover:text-brand transition-colors">AI Events</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[250px]">{event.title}</span>
      </nav>

      {/* ─── Top: Image+Host Left | Details+CTA Right ─── */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-6 md:gap-8 mb-8">
        {/* Left: Image + Host (3 cols) */}
        <div className="md:col-span-3 space-y-3">
          {/* Cover Image — square */}
          <div className="rounded-xl overflow-hidden bg-gradient-to-br from-brand/5 to-brand/10 relative aspect-square">
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
              <div className="w-full h-full flex items-center justify-center">
                <Calendar className="w-12 h-12 text-brand/20" />
              </div>
            )}
            <div className="absolute top-3 left-3 flex gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider bg-white/90 backdrop-blur-sm text-brand px-2 py-0.5 rounded-full">{event.category.replace(/_/g, " ")}</span>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/90 backdrop-blur-sm text-navy px-2 py-0.5 rounded-full">{event.format.replace(/_/g, " ")}</span>
            </div>
          </div>

          {/* Host */}
          {(() => {
            const isExternal = !!event.sourceUrl;
            const displayOrganizer = isExternal
              ? (event.subtitle?.startsWith('Hosted by ') ? event.subtitle.replace('Hosted by ', '') : null)
              : event.organizerName;
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
                      <p className="text-sm font-semibold text-navy dark:text-white font-jakarta">{displayOrganizer}</p>
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
          {/* Title */}
          <h1 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white leading-tight mb-1.5">
            {event.title}
          </h1>
          {event.subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mb-4">{event.subtitle}</p>
          )}

          {/* Meta details */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
              <Calendar className="w-4 h-4 text-brand shrink-0" />
              <span>{formatDate(event.startAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
              <Clock className="w-4 h-4 text-brand shrink-0" />
              <span>{formatTime(event.startAt, event.timezone)} – {formatTime(event.endAt, event.timezone)}</span>
              <span className="text-xs text-gray-400">({event.timezone.split("/")[1]})</span>
            </div>
            {event.venueName && (
              <div className="flex items-center gap-2 text-sm font-jakarta">
                <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-gray-400 italic">Register to See Address</span>
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
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
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
                  <span className="text-lg font-sora font-bold text-navy dark:text-white">Free</span>
                  {event.registrationDeadline && (
                    <span className="text-xs text-gray-400 font-jakarta">Closes {new Date(event.registrationDeadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  )}
                </div>
                {regOpen ? (
                  <button onClick={() => setShowRegistration(true)} className="w-full py-3 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl transition-colors shadow-lg shadow-brand/20">
                    Register Now — Free
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
          </div>
        </div>
      </div>

      {/* ─── Below-fold: Agenda, Tags, Similar ─── */}
      <div className="space-y-8 max-w-4xl mt-8">
          {/* Agenda */}
          {agenda.length > 0 && (
            <div>
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">
                Schedule
              </h2>
              {Object.entries(agendaByDay).map(([day, items]) => (
                <div key={day} className="mb-6">
                  {Object.keys(agendaByDay).length > 1 && (
                    <p className="text-xs font-bold uppercase text-gray-400 font-jakarta mb-2">
                      Day {day}
                    </p>
                  )}
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
                      >
                        <div className="min-w-[80px] text-right">
                          <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                            {item.startTime}
                          </p>
                          <p className="text-xs font-mono text-gray-400">
                            {item.endTime}
                          </p>
                        </div>
                        <div className="border-l-2 border-brand/20 pl-4 flex-1">
                          <p className="text-sm font-semibold text-navy dark:text-white font-jakarta">
                            {item.title}
                          </p>
                          {item.speakerName && (
                            <p className="text-xs text-brand font-jakarta mt-0.5">
                              {item.speakerName}
                            </p>
                          )}
                          {item.description && (
                            <p className="text-xs text-gray-400 font-jakarta mt-1">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

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
                      {new Date(se.startAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                      {se.venueName && ` · ${se.venueName}`}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
      </div>

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

  const html = typeof description === "object" && description?.html ? description.html : null;
  const text = typeof description === "string"
    ? description
    : typeof description === "object" && description?.text
    ? description.text
    : "";

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
          className="text-xs text-brand font-semibold font-jakarta mt-1.5 hover:underline"
        >
          {expanded ? "Show less" : "See more"}
        </button>
      ) : null}
    </div>
  );
}

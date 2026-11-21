"use client";

import { formatTimeLabel } from "@/components/ui/DateTimeFields";
import Image from "next/image";
import { Calendar, MapPin, Video, X, Clock, Users, Globe, Image as ImageIcon, Mail, User, Mic, Check, Ticket, ExternalLink } from "lucide-react";
import { CATEGORIES, CATEGORY_VALUES, type EventFormView } from "./event-form-data";

/** Full-screen "this is how attendees will see your event", opened from the form's Preview button. */
export default function EventPreview({ title, subtitle, category, topics, coverImageUrl, description, startDate, startTime, endDate, endTime, multiDay, agendaDays, format, venueName, address, city, meetingLink, unlimited, capacity, waitlist, approvalRequired, ticketTiers, speakers, agenda, contactEmail, website, onClose }: EventFormView & { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-y-auto">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 font-jakarta">Preview mode</span>
            </div>
            <span className="text-xs text-gray-400 font-jakarta hidden sm:inline">This is how attendees will see your event</span>
          </div>
          <button type="button" onClick={() => onClose()} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold font-jakarta border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200">
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-16">
        {/* Cover image */}
        <div className="relative bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden mt-6" style={{ aspectRatio: "2/1" }}>
          {coverImageUrl ? (
            <Image src={coverImageUrl} alt="" fill unoptimized className="object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <ImageIcon className="w-12 h-12 text-gray-300 dark:text-gray-600" />
              <span className="text-sm text-gray-400 font-jakarta">No cover image added</span>
            </div>
          )}
          <span className="absolute top-3 left-3 text-xs font-bold uppercase bg-white/90 dark:bg-gray-900/90 text-brand px-3 py-1.5 rounded-full font-jakarta">
            {CATEGORIES[CATEGORY_VALUES.indexOf(category)]}
          </span>
        </div>

        {/* Main content */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left column — event details */}
          <div className="md:col-span-2 space-y-8">
            {/* Date & title */}
            <div>
              {startDate ? (
                <p className="text-sm text-brand font-semibold font-jakarta mb-2">
                  {new Date(startDate + "T00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {startTime && ` · ${formatTimeLabel(startTime)}`}
                  {endTime && ` – ${formatTimeLabel(endTime)}`}
                  {multiDay && endDate && (
                    <> to {new Date(endDate + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</>
                  )}
                </p>
              ) : (
                <p className="text-sm text-brand font-jakarta mb-2">Date & time to be set</p>
              )}
              <h1 className="font-sora font-bold text-3xl text-navy dark:text-white leading-tight">
                {title || <span className="text-gray-300 dark:text-gray-600">Your event name</span>}
              </h1>
              {subtitle && <p className="text-base text-gray-500 font-jakarta mt-2">{subtitle}</p>}
            </div>

            {/* Topics */}
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topics.map((t, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md font-jakarta font-medium">#{t}</span>
                ))}
              </div>
            )}

            {/* Description */}
            {description ? (
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta uppercase tracking-wider mb-3">About this event</h2>
                {/* The editor's own output: only the formatting the editor has (headings, lists, bold, links). Shown formatted,
                    as attendees will see it. It used to be printed as raw text, tags and all. */}
                <div className="prose prose-sm dark:prose-invert max-w-none font-jakarta text-gray-700 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: description }} />
              </div>
            ) : (
              <div className="py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-md text-center">
                <p className="text-sm text-gray-400 font-jakarta">No description added yet</p>
              </div>
            )}

            {/* Speakers */}
            {speakers.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta uppercase tracking-wider mb-4">Speakers</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {speakers.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                        {s.photo ? <Image src={s.photo} alt="" width={48} height={48} className="rounded-full object-cover" /> : <User className="w-5 h-5 text-gray-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white font-jakarta truncate">{s.name}</p>
                        {s.title && <p className="text-xs text-gray-500 font-jakarta truncate">{s.title}{s.company && ` · ${s.company}`}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agenda */}
            {agenda.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta uppercase tracking-wider mb-4">Agenda</h2>
                <div className="space-y-0">
                  {agenda.filter(item => item.title.trim()).map((item, i) => (
                    <div key={i} className="flex gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-sm font-semibold text-brand font-jakarta w-20 shrink-0">{agendaDays > 1 ? `D${item.day} ` : ""}{item.time || "TBD"}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white font-jakarta">{item.title}</p>
                        {item.speaker && <p className="text-xs text-gray-500 font-jakarta mt-0.5">{item.speaker}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — registration card */}
          <div>
            <div className="sticky top-20 space-y-4">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta">Registration</h3>

                {/* Ticket tiers */}
                {ticketTiers.length > 0 ? (
                  <div className="space-y-2">
                    {ticketTiers.map((tier, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                        <div>
                          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{tier.name}</p>
                          {tier.description && <p className="text-xs text-gray-400 font-jakarta">{tier.description}</p>}
                        </div>
                        <span className={`text-sm font-bold font-jakarta ${Number(tier.priceRupees) > 0 ? "text-gray-900 dark:text-white" : "text-green-600"}`}>{Number(tier.priceRupees) > 0 ? `₹${Number(tier.priceRupees).toLocaleString("en-IN")}` : "Free"}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">General admission</span>
                    <span className="text-sm font-bold text-green-600 font-jakarta">Free</span>
                  </div>
                )}

                <p className="text-xs text-gray-400 font-jakarta">
                  {unlimited ? "Unlimited spots available" : `${capacity || "0"} spots available`}
                  {waitlist && " · Waitlist enabled"}
                </p>

                <div className="w-full py-3 bg-brand text-white text-sm font-bold font-jakarta rounded-md text-center">
                  Register now
                </div>

                {approvalRequired && (
                  <p className="text-xs text-gray-400 font-jakarta text-center">Registration requires organizer approval</p>
                )}
              </div>

              {/* Location card */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5 space-y-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta">Location</h3>
                {format === "VIRTUAL" ? (
                  <div className="flex items-center gap-2 text-sm text-purple-600 font-jakarta">
                    <Video className="w-4 h-4" />
                    Online event
                  </div>
                ) : venueName || city ? (
                  <div className="space-y-1">
                    {venueName && <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{venueName}</p>}
                    {address && <p className="text-sm text-gray-500 font-jakarta">{address}</p>}
                    {city && <p className="text-sm text-gray-500 font-jakarta">{city}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 font-jakarta">Location to be announced</p>
                )}
                {format === "HYBRID" && meetingLink && (
                  <div className="flex items-center gap-2 text-sm text-purple-600 font-jakarta pt-2 border-t border-gray-100 dark:border-gray-800">
                    <Video className="w-4 h-4" />
                    Also available online
                  </div>
                )}
              </div>

              {/* Contact */}
              {(contactEmail || website) && (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5 space-y-2">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta">Contact</h3>
                  {contactEmail && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" /> {contactEmail}
                    </p>
                  )}
                  {website && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-gray-400" /> {website}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

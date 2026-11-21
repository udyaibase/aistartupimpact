"use client";

import Image from "next/image";
import { Calendar, MapPin, Video, X, Clock, Users, Globe, Image as ImageIcon, Mail, User, Mic, Check, Ticket, ExternalLink } from "lucide-react";
import { CATEGORIES, CATEGORY_VALUES, type EventFormView } from "./event-form-data";

interface SidebarProps extends EventFormView {
  /** "Free", "From ₹499"… from the tickets entered so far. */
  priceLabel: string;
  metCount: number;
  publishRequirements: { label: string; met: boolean }[];
}

/** Desktop only: the card attendees will see, updating as the host types, and the "ready to publish" checklist. */
export default function EventFormSidebar({ title, category, topics, coverImageUrl, startDate, startTime, format, venueName, city, unlimited, capacity, priceLabel, metCount, publishRequirements }: SidebarProps) {
  return (
      <div className="hidden lg:block">
        <div className="sticky top-2 space-y-5">
          {/* Live preview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Live preview</p>
              <span className="flex items-center gap-1.5 text-xs text-gray-400 font-jakarta">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Updates as you type
              </span>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden shadow-sm">
              {/* Cover preview */}
              <div className="relative bg-gray-100 dark:bg-gray-800" style={{ aspectRatio: "16/9" }}>
                {coverImageUrl ? (
                  <Image src={coverImageUrl} alt="" fill unoptimized className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
                {/* Category badge */}
                <span className="absolute top-2.5 left-2.5 text-xs font-bold uppercase bg-white/90 dark:bg-gray-900/90 text-brand px-2.5 py-1 rounded-full font-jakarta">
                  {CATEGORIES[CATEGORY_VALUES.indexOf(category)]}
                </span>
              </div>

              <div className="p-4 space-y-2.5">
                {/* Date & time */}
                {startDate ? (
                  <p className="text-sm text-brand font-semibold font-jakarta">
                    {new Date(startDate + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    {startTime && ` · ${startTime}`}
                  </p>
                ) : (
                  <p className="text-sm text-brand font-jakarta">Date & time to be set</p>
                )}

                {/* Title */}
                <h3 className="font-sora font-bold text-base text-navy dark:text-white leading-snug">
                  {title || <span className="text-gray-300 dark:text-gray-600">Your event name</span>}
                </h3>

                {/* Location */}
                <p className="text-sm text-gray-500 font-jakarta flex items-center gap-1.5">
                  {format === "VIRTUAL" ? (
                    <><Video className="w-3.5 h-3.5 text-purple-500" /> Online</>
                  ) : city || venueName ? (
                    <><MapPin className="w-3.5 h-3.5 text-gray-400" /> {venueName || city}</>
                  ) : (
                    <><MapPin className="w-3.5 h-3.5 text-gray-300" /> Location to be announced</>
                  )}
                </p>

                {/* Tags */}
                {topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {topics.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded font-jakarta">#{t}</span>
                    ))}
                  </div>
                )}

                {/* Price + capacity */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div>
                    <span className="text-sm font-bold text-green-600 font-jakarta">{priceLabel}</span>
                    <p className="text-xs text-gray-400 font-jakarta">{unlimited ? "Unlimited spots" : `${capacity || "0"} spots`}</p>
                  </div>
                  <div className="px-5 py-2 bg-brand text-white text-sm font-bold font-jakarta rounded-md">
                    Register
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ready to publish checklist */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Ready to publish</p>
              <span className="text-sm font-bold text-gray-400 font-jakarta">{metCount}/6</span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(metCount / 6) * 100}%` }} />
            </div>
            <div className="space-y-3">
              {publishRequirements.map((req, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    req.met ? "bg-green-500" : "border-2 border-gray-200 dark:border-gray-700"
                  }`}>
                    {req.met && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`text-sm font-jakarta ${req.met ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-300"}`}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
  );
}

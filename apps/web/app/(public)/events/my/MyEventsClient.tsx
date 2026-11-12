"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Calendar,
  MapPin,
  Video,
  QrCode,
  Download,
  Clock,
  CheckCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";

interface Registration {
  id: string;
  eventTitle: string;
  eventSlug: string;
  eventCategory: string;
  eventFormat: string;
  eventStartAt: string;
  eventEndAt: string;
  eventTimezone: string;
  eventVenueName?: string;
  eventCoverImageUrl?: string;
  status: string;
  qrToken: string;
  registeredAt: string;
  checkedInAt?: string;
}

export default function MyEventsClient() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const fetchRegistrations = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/events/my");
      const data = await res.json();
      if (data.success) {
        setRegistrations(data.registrations || []);
      } else {
        setError(data.error || "Failed to fetch registrations.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const upcoming = registrations.filter((r) => new Date(r.eventStartAt) >= now);
  const past = registrations.filter((r) => new Date(r.eventStartAt) < now);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
        <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-jakarta text-sm">{error}</p>
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-brand font-semibold mt-3 hover:underline font-jakarta"
        >
          Browse events <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  if (registrations.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
        <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400 font-jakarta text-sm font-medium">
          No registrations yet
        </p>
        <p className="text-gray-400 font-jakarta text-xs mt-1">
          Events you register for will appear here.
        </p>
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-brand font-semibold mt-4 hover:underline font-jakarta"
        >
          Browse upcoming events <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upcoming Events */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-3">
            Upcoming ({upcoming.length})
          </h2>
          <div className="space-y-3">
            {upcoming.map((reg) => (
              <EventRegistrationCard key={reg.id} reg={reg} />
            ))}
          </div>
        </div>
      )}

      {/* Past Events */}
      {past.length > 0 && (
        <div>
          <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-3">
            Past ({past.length})
          </h2>
          <div className="space-y-3 opacity-75">
            {past.map((reg) => (
              <EventRegistrationCard key={reg.id} reg={reg} isPast />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventRegistrationCard({ reg, isPast }: { reg: Registration; isPast?: boolean }) {
  const [showQr, setShowQr] = useState(false);

  const checkInUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/check-in?token=${reg.qrToken}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkInUrl)}`;
  const calendarUrl = `/api/events/calendar?slug=${reg.eventSlug}`;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5">
      <div className="flex gap-4">
        {/* Event Cover */}
        <div className="hidden sm:block w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
          {reg.eventCoverImageUrl ? (
            <Image src={reg.eventCoverImageUrl} alt={`${reg.eventTitle ?? 'Event'} cover image`} width={80} height={80} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Calendar className="w-6 h-6 text-gray-300" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/events/${reg.eventSlug}`} className="hover:text-brand transition-colors">
              <h3 className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white line-clamp-1">
                {reg.eventTitle}
              </h3>
            </Link>
            <StatusBadge status={reg.status} />
          </div>

          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400 font-jakarta">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(reg.eventStartAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(reg.eventStartAt)}
            </span>
            {reg.eventVenueName ? (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {reg.eventVenueName}
              </span>
            ) : reg.eventFormat === "VIRTUAL" ? (
              <span className="flex items-center gap-1">
                <Video className="w-3 h-3" />
                Virtual
              </span>
            ) : null}
          </div>

          {/* Actions */}
          {!isPast && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => setShowQr(!showQr)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-jakarta bg-brand/5 text-brand rounded-lg hover:bg-brand/10 transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                {showQr ? "Hide QR" : "QR Code"}
              </button>
              <a
                href={calendarUrl}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Calendar
              </a>
            </div>
          )}

          {reg.status === "CHECKED_IN" && reg.checkedInAt && (
            <p className="flex items-center gap-1 mt-2 text-xs text-green-600 font-jakarta font-medium">
              <CheckCircle className="w-3.5 h-3.5" />
              Checked in at {new Date(reg.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>

      {/* QR Code */}
      {showQr && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col items-center gap-2">
          <Image src={qrImageUrl} alt="Check-in QR Code" width={160} height={160} className="rounded-lg" unoptimized />
          <p className="text-xs text-gray-400 font-jakarta">Show this at event check-in</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CONFIRMED: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    CHECKED_IN: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    WAITLISTED: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    CANCELLED: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${styles[status] || styles.CONFIRMED}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

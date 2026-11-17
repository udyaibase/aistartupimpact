"use client";

import Link from "next/link";
import { Calendar, Eye, MapPin, Ticket, Users, Video } from "lucide-react";

/**
 * What Staff and Check-in teammates see instead of the edit form: the event's details, clearly marked view-only,
 * with links to the parts of the portal their role can use.
 */
export default function EventReadOnly({ event, canViewAttendees }: { event: any; canViewAttendees: boolean }) {
  const tz = event.timezone || "Asia/Kolkata";
  const when = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
    } catch {
      return new Date(iso).toLocaleString("en-IN");
    }
  };
  const address = String(event.address ?? "").split("|||")[0];
  const descriptionText: string = event.description?.text ?? "";
  const label = (v: string) => String(v ?? "").toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  // Check-in teammates don't receive the attendee list; the event's own counter is enough here.
  const registered = Array.isArray(event.registrations)
    ? event.registrations.filter((r: any) => r.status !== "CANCELLED").length
    : Number(event.registrationCount ?? 0);

  return (
    <div className="max-w-3xl mx-auto font-jakarta">
      <div role="status" className="mb-5 flex items-start gap-2.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/10 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
        <Eye className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
        <p>View only. Your role can see this event but not change it. Ask an owner, admin or manager to make changes.</p>
      </div>

      {event.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.coverImageUrl} alt="" className="w-full aspect-[16/9] object-cover rounded-xl border border-gray-200 dark:border-gray-800" />
      )}
      <p className="mt-5 text-xs font-bold uppercase tracking-wider text-gray-500">{label(event.category)} · {label(event.status)}</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{event.title}</h1>
      {event.subtitle && <p className="mt-1 text-gray-600 dark:text-gray-400">{event.subtitle}</p>}

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 text-sm">
        <div className="flex gap-2"><Calendar className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden /><div><dt className="sr-only">When</dt><dd className="text-gray-900 dark:text-white">{when(event.startAt)}</dd><dd className="text-gray-500">to {when(event.endAt)} ({tz})</dd></div></div>
        <div className="flex gap-2">
          {event.format === "VIRTUAL" ? <Video className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden /> : <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden />}
          <div><dt className="sr-only">Where</dt><dd className="text-gray-900 dark:text-white">{label(event.format)}</dd><dd className="text-gray-500">{[event.venueName, address].filter(Boolean).join(", ") || (event.format === "VIRTUAL" ? "Online" : "No venue given")}</dd></div>
        </div>
        <div className="flex gap-2"><Users className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden /><div><dt className="sr-only">Registrations</dt><dd className="text-gray-900 dark:text-white">{registered.toLocaleString("en-IN")} registered</dd><dd className="text-gray-500">{event.capacity ? `Capacity ${event.capacity.toLocaleString("en-IN")}` : "No capacity limit"}</dd></div></div>
        <div className="flex gap-2"><Ticket className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden /><div><dt className="sr-only">Tickets</dt>
          {(event.ticketTiers ?? []).length === 0 ? <dd className="text-gray-500">Free registration</dd> : (event.ticketTiers as any[]).map((t) => (
            <dd key={t.id} className="text-gray-900 dark:text-white">{t.name} · {t.priceCents > 0 ? `₹${(t.priceCents / 100).toLocaleString("en-IN")}` : "Free"}{t.quantity ? <span className="text-gray-500"> · {t.soldCount}/{t.quantity}</span> : null}</dd>
          ))}
        </div></div>
      </dl>

      {descriptionText && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">About</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{descriptionText}</p>
        </section>
      )}
      {(event.speakers ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">Speakers</h2>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
            {(event.speakers as any[]).map((s) => <li key={s.id}>{s.name}{s.title || s.company ? <span className="text-gray-500"> · {[s.title, s.company].filter(Boolean).join(", ")}</span> : null}</li>)}
          </ul>
        </section>
      )}
      {(event.agendaItems ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">Agenda</h2>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
            {(event.agendaItems as any[]).map((a) => <li key={a.id}><span className="text-gray-500 tabular-nums">{a.startTime}</span> {a.title}</li>)}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        {canViewAttendees && <Link href="/organizer/attendees" className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">View attendees</Link>}
        <Link href="/organizer/check-in" className="inline-flex items-center min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Open check-in</Link>
        <Link href="/organizer/events" className="inline-flex items-center min-h-[44px] px-4 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:underline">Back to events</Link>
      </div>
    </div>
  );
}

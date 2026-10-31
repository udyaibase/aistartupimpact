"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Lock, Mail, MapPin, Send, Sparkles } from "lucide-react";
import { EVENT_BOOST, HOST_PLANS } from "@/lib/events/plans";
import { rupees } from "@/lib/employer/plans";

interface PromoEvent { id: string; title: string; startAt: string; format: string; promoCredits: number; boostedAt: string | null }
interface Campaign { id: string; subject: string; status: string; recipientCount: number; createdAt: string; creditSource: string | null; event: { title: string } | null }
interface Data { plan: "FREE" | "PRO"; promo: { used: number; limit: number; left: number }; events: PromoEvent[]; campaigns: Campaign[]; noteMax: number }

const card = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]";
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function PromotePage() {
  return <Suspense><Promote /></Suspense>;
}

function Promote() {
  const preselected = useSearchParams().get("event") || "";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [eventId, setEventId] = useState("");
  const [audience, setAudience] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  const load = () => fetch("/api/organizer/promote").then((r) => r.json()).then((d) => {
    if (!d.success) { setError(d.error || "Couldn’t load promotions."); return; }
    setData(d);
    const first = d.events.find((e: PromoEvent) => e.id === preselected) ?? d.events[0];
    if (first) setEventId((cur) => cur || first.id);
  }).catch(() => setError("You seem to be offline."));

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!eventId) return;
    setAudience(null);
    fetch(`/api/organizer/promote?eventId=${eventId}`).then((r) => r.json()).then((d) => setAudience(d.success ? d.audience : 0)).catch(() => setAudience(0));
  }, [eventId]);

  const ev = data?.events.find((e) => e.id === eventId);
  const credits = (ev?.promoCredits ?? 0) + (data?.promo.left ?? 0);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/organizer/promote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, note }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setSent(d.recipients); setNote(""); load(); }
      else setError(d.error || "Couldn’t send.");
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(false);
  }

  if (!data) {
    return (
      <div className="font-jakarta">
        <h1 className="portal-title">Promote</h1>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : <Loader2 className="w-5 h-5 animate-spin text-gray-400 mt-6" aria-label="Loading" />}
      </div>
    );
  }

  return (
    <div className="font-jakarta space-y-5">
      <div>
        <h1 className="portal-title">Promote</h1>
        <p className="portal-subtitle">Udyaibase emails your event to people near it who asked to hear about AI events. One email per event a week; everyone can unsubscribe.</p>
      </div>

      <div className={`${card} p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm`}>
        <span className="inline-flex items-center gap-2 text-gray-800 dark:text-gray-200">
          <Mail className="w-4 h-4 text-gray-500" aria-hidden />
          {data.plan === "PRO" ? <>Pro · <strong className="tabular-nums">{data.promo.left}</strong> of {data.promo.limit} promo emails left this month</> : "Free plan · no monthly promo emails"}
        </span>
        <span className="text-gray-600 dark:text-gray-400">Each Event Boost adds 1 promo email for that event.</span>
        <Link href="/organizer/billing" className="ml-auto text-sm font-semibold text-gray-900 dark:text-white hover:underline">Plans &amp; billing</Link>
      </div>

      {sent != null && (
        <p role="status" className="flex items-center gap-2 rounded-[12px] bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4" aria-hidden /> Sending to {sent.toLocaleString("en-IN")} people. It usually finishes within a few minutes.
        </p>
      )}

      {data.events.length === 0 ? (
        <div className={`${card} px-4 py-10 text-center`}>
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No upcoming public events</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Publish an event to promote it.</p>
          <Link href="/organizer/events" className="mt-4 inline-flex min-h-[44px] items-center px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">Go to events</Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <section aria-labelledby="new-promo" className={`${card} p-4 sm:p-5 space-y-4`}>
            <h2 id="new-promo" className="portal-section-title">New promo email</h2>
            <div>
              <label htmlFor="promo-event" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Event</label>
              <select id="promo-event" value={eventId} onChange={(e) => { setEventId(e.target.value); setSent(null); }}
                className="w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25">
                {data.events.map((e) => <option key={e.id} value={e.id}>{e.title} · {fmt(e.startAt)}{e.promoCredits ? " · boost credit" : ""}</option>)}
              </select>
            </div>
            <p className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" aria-hidden />
              {audience == null ? "Counting subscribers…"
                : audience === 0 ? "No subscribers near this event yet. Try again closer to the date as more people sign up."
                : <span><strong className="tabular-nums">{audience.toLocaleString("en-IN")}</strong> {ev?.format === "VIRTUAL" ? "subscribers (online event, so anyone can join)" : "subscribers live near this event"} and haven’t registered yet.</span>}
            </p>
            <div>
              <label htmlFor="promo-note" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">A line from you <span className="font-normal text-gray-500">(optional)</span></label>
              <textarea id="promo-note" rows={3} maxLength={data.noteMax} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hands-on session, bring your laptop. Free pizza!"
                className="w-full px-3 py-2.5 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 resize-none" />
              <p className="mt-1 text-xs text-gray-500 text-right tabular-nums">{note.length}/{data.noteMax}</p>
            </div>
            {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
            {credits > 0 ? (
              <button type="button" onClick={send} disabled={busy || !audience}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                Send to {audience ? audience.toLocaleString("en-IN") : ""} people · uses 1 {ev?.promoCredits ? "boost credit" : "promo email"}
              </button>
            ) : (
              <div className="rounded-[12px] border border-dashed border-gray-300 dark:border-gray-700 p-3.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><Lock className="w-4 h-4" aria-hidden /> No promo emails left for this event</p>
                <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-400">Boost this event ({rupees(EVENT_BOOST.pricePaise)}, includes {EVENT_BOOST.promoEmails} promo email and featured placement) or go Pro for {HOST_PLANS.PRO.promoEmailsPerPeriod} a month.</p>
                <Link href={`/organizer/billing?boost=${eventId}`} className="mt-2.5 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold">
                  <Sparkles className="w-4 h-4" aria-hidden /> See options
                </Link>
              </div>
            )}
          </section>

          <section aria-label="Email preview" className={`${card} p-4 sm:p-5`}>
            <h2 className="portal-section-title mb-3">What people receive</h2>
            <div className="rounded-[12px] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 text-[13.5px]">
              <p className="text-xs text-gray-500">An AI event near you</p>
              <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">{ev?.title}</p>
              <p className="mt-1 text-gray-700 dark:text-gray-300">{ev && new Date(ev.startAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</p>
              {note.trim() && <p className="mt-3 border-l-2 border-gray-300 dark:border-gray-700 pl-3 text-gray-700 dark:text-gray-300">“{note.trim()}”</p>}
              <span className="mt-4 inline-block px-3 py-2 rounded-[8px] bg-[#A50F15] text-white text-[13px] font-semibold">See the event</span>
              <p className="mt-3 text-[11.5px] text-gray-500">You’re getting this because you asked Udyaibase to tell you about AI events in your area. Unsubscribe</p>
            </div>
            <p className="mt-2 text-xs text-gray-500">Sent from Udyaibase in this layout, with your event details. People who already registered aren’t emailed.</p>
          </section>
        </div>
      )}

      {data.campaigns.length > 0 && (
        <section aria-labelledby="past" className={`${card} overflow-x-auto`}>
          <h2 id="past" className="portal-section-title px-4 sm:px-5 pt-4 pb-2">Sent</h2>
          <table className="w-full text-sm min-w-[480px]">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
              {["Date", "Event", "People", "Status"].map((h) => <th key={h} scope="col" className="px-4 sm:px-5 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 sm:px-5 py-2.5 whitespace-nowrap">{fmt(c.createdAt)}</td>
                  <td className="px-4 sm:px-5 py-2.5">{c.event?.title ?? c.subject}</td>
                  <td className="px-4 sm:px-5 py-2.5 tabular-nums">{c.recipientCount.toLocaleString("en-IN")}</td>
                  <td className="px-4 sm:px-5 py-2.5">{c.status === "SENT" ? "Sent" : c.status === "SENDING" ? "Sending…" : "Failed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

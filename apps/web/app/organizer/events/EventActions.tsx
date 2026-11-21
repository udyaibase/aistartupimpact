"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreVertical, Edit, Trash2, Share2, ExternalLink, Copy, Check, CodeXml, Send, EyeOff, Loader2, Award, Repeat, CalendarRange, Mic, Handshake, IdCard } from "lucide-react";

interface Props {
  /** What this person's role can do; defaults to everything (owner). The API checks the same rules. */
  allowed?: { edit: boolean; del: boolean; promote: boolean; download: boolean; embed: boolean };
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  shortCode?: string;
  status: string;
  registrationCount: number;
}

const ALL = { edit: true, del: true, promote: true, download: true, embed: true };

export default function EventActions({ eventId, eventSlug, eventTitle, shortCode, status, registrationCount, allowed = ALL }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Phones: the menu is a bottom sheet over everything (portaled, so no card or tab bar can cover it).
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const [showDelete, setShowDelete] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [showUnpublish, setShowUnpublish] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [repeatDate, setRepeatDate] = useState("");
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [repeatError, setRepeatError] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const isDraft = status === "DRAFT";
  const isPublished = status === "PUBLISHED";

  const changeStatus = async (next: "PUBLISHED" | "DRAFT") => {
    setOpen(false);
    setShowUnpublish(false);
    setStatusError("");
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) {
        setStatusError(d.error || (next === "PUBLISHED" ? "Couldn't publish this event." : "Couldn't unpublish this event."));
        return;
      }
      if (next === "PUBLISHED") router.push(`/organizer/events?published=${eventId}`, { scroll: false });
      router.refresh();
    } catch {
      setStatusError("You seem to be offline. Check your connection and try again.");
    } finally {
      setStatusBusy(false);
    }
  };

  const runAgain = async () => {
    if (!repeatDate) { setRepeatError("Choose a date."); return; }
    setRepeatBusy(true);
    setRepeatError("");
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: repeatDate }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setRepeatError(d.error || "Couldn't copy this event."); return; }
      router.push(`/organizer/events/${d.id}?copied=1`);
    } catch {
      setRepeatError("You seem to be offline. Check your connection and try again.");
    } finally {
      setRepeatBusy(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${origin}/events/${eventSlug}`;
  const shortUrl = shortCode ? `${origin}/e/${shortCode}` : publicUrl;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        console.error("Delete failed:", data);
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
    setDeleting(false);
    setShowDelete(false);
    setOpen(false);
  };

  // Clipboard access can be refused (some installed apps and in-app browsers): fall back to the older copy command.
  const handleCopy = async () => {
    const text = shortCode ? shortUrl : publicUrl;
    let ok = false;
    try {
      // Some browsers leave the request waiting for a permission that never comes: give it a second.
      await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 1000))]);
      ok = true;
    }
    catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove();
      } catch { ok = false; }
    }
    if (!ok) {
      setCopyError("Couldn't copy here. The link is selected: press and hold it to copy.");
      const field = document.querySelector<HTMLInputElement>("[data-share-link]");
      field?.focus(); field?.select();
      return;
    }
    setCopyError("");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // The phone's own share sheet (WhatsApp, Messages, Mail…) where the browser offers it.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"); }, []);
  const handleNativeShare = async () => {
    try { await navigator.share({ title: eventTitle, text: eventTitle, url: shortCode ? shortUrl : publicUrl }); } catch { /* cancelled */ }
  };

  const handleShareTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(eventTitle)}&url=${encodeURIComponent(shortUrl)}`, "_blank");
  };

  const handleShareLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shortUrl)}`, "_blank");
  };

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${eventTitle} ${shortUrl}`)}`, "_blank");
  };

  // Dialogs render at the top of the page: inside the card, a neighbouring card or the tab bar could cover them.
  const toBody = (node: React.ReactNode) => (typeof document !== "undefined" ? createPortal(node, document.body) : null);

  return (
    <div className="relative flex items-center gap-2" data-menu-open={open || undefined}>
      {isDraft && (
        <button
 data-tour="event-publish"          onClick={() => changeStatus("PUBLISHED")}
          disabled={statusBusy}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-brand hover:bg-brand-600 text-white text-xs font-bold font-jakarta disabled:opacity-60 transition-colors"
        >
          {statusBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Publish
        </button>
      )}
      {statusError && (
        <div role="alert" className="absolute right-0 top-full mt-1 w-72 z-[310] rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-900/50 px-3 py-2 text-xs text-red-800 dark:text-red-200 font-jakarta shadow-lg">
          <p>{statusError}</p>
          <div className="mt-1.5 flex gap-3">
            <Link href={`/organizer/events/${eventId}`} className="font-semibold underline">Edit event</Link>
            <button onClick={() => setStatusError("")} className="font-semibold underline">Dismiss</button>
          </div>
        </div>
      )}
      {/* Trigger */}
      <button
 data-tour="event-actions"        onClick={() => setOpen(!open)}
        aria-label={`Actions for ${eventTitle}`}
        className="w-11 h-11 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 rounded-lg transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {/* Menu: a dropdown on bigger screens, a bottom sheet on phones */}
      {open && (() => {
        const items = (
          <>
            <a href={`/events/${eventSlug}`} target="_blank" rel="noopener" className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" /> View Public Page
            </a>
            {allowed.edit && (
            <Link href={`/organizer/events/${eventId}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Edit className="w-3.5 h-3.5 text-gray-400" /> Edit Event
            </Link>
            )}
            {allowed.edit && (
            <Link href={`/organizer/events/${eventId}/speakers`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Mic className="w-3.5 h-3.5 text-gray-400" /> Call for speakers
            </Link>
            )}
            {allowed.edit && (
            <Link href={`/organizer/events/${eventId}/agenda`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <CalendarRange className="w-3.5 h-3.5 text-gray-400" /> Agenda
            </Link>
            )}
            {allowed.edit && (
            <Link href={`/organizer/events/${eventId}/sponsors`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Handshake className="w-3.5 h-3.5 text-gray-400" /> Sponsors
            </Link>
            )}
            {allowed.edit && (
            <Link href={`/organizer/events/${eventId}/badges`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <IdCard className="w-3.5 h-3.5 text-gray-400" /> Badges
            </Link>
            )}
            {allowed.edit && (
              <button onClick={() => { setOpen(false); setShowRepeat(true); }} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
                <Repeat className="w-3.5 h-3.5 text-gray-400" /> Run it again
              </button>
            )}
            {!isDraft && (
            <Link href={`/organizer/events/${eventId}/after`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Award className="w-3.5 h-3.5 text-gray-400" /> After the event
            </Link>
            )}
            {allowed.promote && (
            <Link href={`/organizer/promote?event=${eventId}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Share2 className="w-3.5 h-3.5 text-gray-400" /> Promote Event
            </Link>
            )}
            {isDraft && allowed.edit && (
              <button onClick={() => changeStatus("PUBLISHED")} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
                <Send className="w-3.5 h-3.5 text-gray-400" /> Publish
              </button>
            )}
            {isPublished && allowed.edit && (
              <button onClick={() => { setOpen(false); setShowUnpublish(true); }} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
                <EyeOff className="w-3.5 h-3.5 text-gray-400" /> Unpublish
              </button>
            )}
            {allowed.download && (
            <a href={`/api/organizer/attendees?eventId=${eventId}`} download className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Copy className="w-3.5 h-3.5 text-gray-400" /> Download Attendees
            </a>
            )}
            <button onClick={() => { setShowShare(true); setOpen(false); }} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Share2 className="w-3.5 h-3.5 text-gray-400" /> Share Event
            </button>
            {allowed.embed && (
            <Link href={`/organizer/embed?event=${eventId}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <CodeXml className="w-3.5 h-3.5 text-gray-400" /> Embed on website
            </Link>
            )}
            {allowed.del && (<>
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <button onClick={() => { setShowDelete(true); setOpen(false); }} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 font-jakarta transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete Event
            </button>
            </>)}
          </>
        );
        if (isPhone && typeof document !== "undefined") {
          return createPortal(
            <div className="fixed inset-0 z-modal flex items-end bg-black/40 animate-fade-in" onClick={() => setOpen(false)}>
              <div role="menu" aria-label={`Actions for ${eventTitle}`} onClick={(e) => e.stopPropagation()}
                className="w-full max-h-[82dvh] overflow-y-auto overscroll-contain bg-white dark:bg-gray-900 rounded-t-[20px] pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-2xl animate-slide-up">
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" aria-hidden />
                <p className="px-4 pb-2 mb-1 border-b border-gray-100 dark:border-gray-800 text-sm font-bold text-gray-900 dark:text-white font-jakarta truncate">{eventTitle}</p>
                {items}
              </div>
            </div>,
            document.body,
          );
        }
        return (
          <>
            <div className="fixed inset-0 z-overlay" onClick={() => setOpen(false)} />
            <div role="menu" className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-[310] py-1 overflow-hidden">
              {items}
            </div>
          </>
        );
      })()}

      {/* Share Modal */}
      {showShare && toBody(
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowShare(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-w-sm w-full space-y-4 animate-slide-up sm:animate-none" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Share Event</h3>
            <p className="text-xs text-gray-500 font-jakarta">{eventTitle}</p>

            {/* Copy Link */}
            <div className="space-y-2">
              {shortCode && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Short Link (for sharing)</p>
                  <div className="flex items-center gap-2">
                    <input type="text" readOnly data-share-link value={shortUrl} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 font-jakarta font-mono" />
                    <button onClick={handleCopy} className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-bold flex items-center gap-1">
                      {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">{shortCode ? "Full URL" : "Event Link"}</p>
                <div className="flex items-center gap-2">
                  <input type="text" readOnly {...(!shortCode ? { "data-share-link": true } : {})} value={publicUrl} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 font-jakarta" />
                  {!shortCode && <button onClick={handleCopy} className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-bold flex items-center gap-1">{copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}</button>}
                </div>
              </div>
            </div>

            {copyError && <p role="alert" className="text-sm text-red-700 dark:text-red-300 font-jakarta">{copyError}</p>}
            {/* Social Share */}
            {canShare && (
              <button onClick={handleNativeShare} className="w-full min-h-[44px] rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold font-jakarta flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" aria-hidden /> Share…
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={handleShareTwitter} className="flex-1 py-2.5 bg-[#1DA1F2]/10 text-[#1DA1F2] rounded-lg text-xs font-bold font-jakarta hover:bg-[#1DA1F2]/20 transition-colors">Twitter</button>
              <button onClick={handleShareLinkedIn} className="flex-1 py-2.5 bg-[#0077B5]/10 text-[#0077B5] rounded-lg text-xs font-bold font-jakarta hover:bg-[#0077B5]/20 transition-colors">LinkedIn</button>
              <button onClick={handleShareWhatsApp} className="flex-1 py-2.5 bg-[#25D366]/10 text-[#25D366] rounded-lg text-xs font-bold font-jakarta hover:bg-[#25D366]/20 transition-colors">WhatsApp</button>
            </div>

            <Link href={`/organizer/embed?event=${eventId}`} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <CodeXml className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Embed on website</span>
                <span className="block text-xs text-gray-500 font-jakarta">Let visitors register on your own site</span>
              </span>
            </Link>

            <button onClick={() => setShowShare(false)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 font-jakarta">Close</button>
          </div>
        </div>
      )}

      {/* Unpublish Confirmation */}
      {showUnpublish && toBody(
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowUnpublish(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="unpublish-title" className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-w-sm w-full space-y-4 animate-slide-up sm:animate-none" onClick={(e) => e.stopPropagation()}>
            <h3 id="unpublish-title" className="font-sora font-bold text-lg text-navy dark:text-white">Unpublish event?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta">
              <strong>{eventTitle}</strong> will be hidden from your event page, search and website widgets, and new registrations stop.
              {registrationCount > 0 && ` The ${registrationCount} people already registered keep their tickets.`} You can publish it again any time.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowUnpublish(false)} className="min-h-[44px] px-4 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-jakarta">Cancel</button>
              <button onClick={() => changeStatus("DRAFT")} disabled={statusBusy} className="px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 text-white rounded-lg font-jakarta font-semibold disabled:opacity-50">
                {statusBusy ? "Unpublishing..." : "Unpublish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run it again */}
      {showRepeat && toBody(
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowRepeat(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="repeat-title" className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-w-sm w-full space-y-4 animate-slide-up sm:animate-none" onClick={(e) => e.stopPropagation()}>
            <h3 id="repeat-title" className="font-sora font-bold text-lg text-navy dark:text-white">Run it again</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta">
              Copies <strong>{eventTitle}</strong> to a new date as a draft: details, speakers, agenda, tickets and questions, at the same time of day. You can review it before publishing.
            </p>
            <div>
              <label htmlFor="repeat-date" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5 font-jakarta">New date</label>
              <input id="repeat-date" type="date" value={repeatDate} min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setRepeatDate(e.target.value); setRepeatError(""); }}
                className="w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand" />
              {repeatError && <p role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400 font-jakarta">{repeatError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRepeat(false)} className="min-h-[44px] px-4 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-jakarta">Cancel</button>
              <button onClick={runAgain} disabled={repeatBusy || !repeatDate} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 text-white rounded-lg font-jakarta font-semibold disabled:opacity-50">
                {repeatBusy && <Loader2 className="w-4 h-4 animate-spin" />} Create copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDelete && toBody(
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowDelete(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-w-sm w-full space-y-4 animate-slide-up sm:animate-none" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Event</h3>
            <p className="text-sm text-gray-500 font-jakarta">
              Are you sure you want to delete <strong>{eventTitle}</strong>? This will remove it from public listings. Data is preserved for records.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDelete(false)} className="min-h-[44px] px-4 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-jakarta">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-jakarta font-semibold disabled:opacity-50">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreVertical, Edit, Trash2, Share2, ExternalLink, Copy, Check, CodeXml, Send, EyeOff, Loader2 } from "lucide-react";

interface Props {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  shortCode?: string;
  status: string;
  registrationCount: number;
}

export default function EventActions({ eventId, eventSlug, eventTitle, shortCode, status, registrationCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUnpublish, setShowUnpublish] = useState(false);
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shortCode ? shortUrl : publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <div className="relative flex items-center gap-2">
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

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-overlay" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-[310] py-1 overflow-hidden">
            <a href={`/events/${eventSlug}`} target="_blank" rel="noopener" className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" /> View Public Page
            </a>
            <Link href={`/organizer/events/${eventId}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Edit className="w-3.5 h-3.5 text-gray-400" /> Edit Event
            </Link>
            <Link href={`/organizer/promote?event=${eventId}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Share2 className="w-3.5 h-3.5 text-gray-400" /> Promote Event
            </Link>
            {isDraft && (
              <button onClick={() => changeStatus("PUBLISHED")} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
                <Send className="w-3.5 h-3.5 text-gray-400" /> Publish
              </button>
            )}
            {isPublished && (
              <button onClick={() => { setOpen(false); setShowUnpublish(true); }} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
                <EyeOff className="w-3.5 h-3.5 text-gray-400" /> Unpublish
              </button>
            )}
            <a href={`/api/organizer/attendees?eventId=${eventId}`} download className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Copy className="w-3.5 h-3.5 text-gray-400" /> Download Attendees
            </a>
            <button onClick={() => { setShowShare(true); setOpen(false); }} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <Share2 className="w-3.5 h-3.5 text-gray-400" /> Share Event
            </button>
            <Link href={`/organizer/embed?event=${eventId}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-jakarta transition-colors">
              <CodeXml className="w-3.5 h-3.5 text-gray-400" /> Embed on website
            </Link>
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <button onClick={() => { setShowDelete(true); setOpen(false); }} className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 font-jakarta transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete Event
            </button>
          </div>
        </>
      )}

      {/* Share Modal */}
      {showShare && (
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
                    <input type="text" readOnly value={shortUrl} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 font-jakarta font-mono" />
                    <button onClick={handleCopy} className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-bold flex items-center gap-1">
                      {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">{shortCode ? "Full URL" : "Event Link"}</p>
                <div className="flex items-center gap-2">
                  <input type="text" readOnly value={publicUrl} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 font-jakarta" />
                  {!shortCode && <button onClick={handleCopy} className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-bold flex items-center gap-1">{copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}</button>}
                </div>
              </div>
            </div>

            {/* Social Share */}
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
      {showUnpublish && (
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

      {/* Delete Confirmation */}
      {showDelete && (
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

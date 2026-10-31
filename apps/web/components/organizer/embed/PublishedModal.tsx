"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Copy, X } from "lucide-react";
import { btnPrimary, btnSecondary, btnGhost } from "./ui";

interface Props {
  event: { id: string; title: string; slug: string; shortCode: string | null };
  liveHost: string | null;
}

export default function PublishedModal({ event, liveHost }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const primaryRef = useRef<HTMLAnchorElement>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(`${window.location.origin}${event.shortCode ? `/e/${event.shortCode}` : `/events/${event.slug}`}`);
  }, [event.shortCode, event.slug]);

  function close() {
    setOpen(false);
    router.replace("/organizer/events", { scroll: false });
  }

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/40" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="published-title"
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-[14px] sm:rounded-[14px] p-6 font-jakarta"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <span className="w-11 h-11 rounded-full bg-green-100 text-green-700 flex items-center justify-center" aria-hidden>
            <CheckCircle2 className="w-6 h-6" />
          </span>
          <button onClick={close} aria-label="Close" className={btnGhost}><X className="w-5 h-5" /></button>
        </div>
        <h2 id="published-title" className="mt-3 text-lg font-bold text-gray-900 dark:text-white">Your event is live</h2>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold">{event.title}</span> is published and taking registrations.
        </p>

        <div className="mt-4 flex gap-2">
          <input readOnly value={url} aria-label="Event link"
            className="flex-1 min-w-0 min-h-[44px] px-3 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-sm text-gray-700 dark:text-gray-300" />
          <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={btnSecondary}>
            {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {liveHost ? (
          <p className="mt-5 rounded-[12px] bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-900 dark:text-green-200">
            It's already showing on <span className="font-semibold">{liveHost}</span> through your website widget.
          </p>
        ) : (
          <div className="mt-5 rounded-[12px] border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Add your events to your website</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Paste one snippet and visitors can register right on your site. Takes about two minutes.
            </p>
            <Link ref={primaryRef} href="/organizer/embed" className={`${btnPrimary} mt-3 w-full`}>Add to your website</Link>
          </div>
        )}

        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <a href={`/events/${event.slug}`} target="_blank" rel="noopener" className={`${btnSecondary} flex-1`}>View event page</a>
          <button onClick={close} className={`${btnGhost} flex-1`}>Done</button>
        </div>
      </div>
    </div>
  );
}

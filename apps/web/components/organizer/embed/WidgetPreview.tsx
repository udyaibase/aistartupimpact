"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Monitor, Smartphone, Sun, Moon, Play } from "lucide-react";
import { card, btnPrimary, btnGhost, displayHost } from "./ui";
import type { PortalWidget } from "@/lib/embed/portal-data";
import InfoTip from "./InfoTip";

export interface PreviewHandle {
  pushConfig: (config: Record<string, unknown>) => void;
  reload: () => void;
}

/** The fields the preview needs; works for both the events and the careers widget. */
type PreviewWidget = Pick<PortalWidget, "id" | "active" | "darkMode" | "firstSeenHost">;

interface Props {
  widget: PreviewWidget;
  hasEvents: boolean;
  canManage: boolean;
  onResume: () => void;
  /** iframe path; defaults to the events widget. */
  src?: string;
  /** Fake address-bar path, e.g. "/events" or "/careers". */
  pagePath?: string;
  /** Shown next to “Live preview”. */
  itemsLabel?: string;
  /** Replaces the default “no upcoming events” notice. */
  emptyNotice?: React.ReactNode;
}

const LOOK_KEYS = [
  "layout", "accentColor", "darkMode", "cornerStyle", "buttonText", "showCover",
  "showPrice", "showSpotsLeft", "showAttendeeCount", "showCategory",
  "buttonSize", "buttonStyle", "cardStyle", "spacing", "showPast", "registrationMode", "maxEvents",
  "heading", "subheading", "headingAlign", "headingSize", "fontFamily", "textScale",
  "maxJobs", "showLogo", "showDepartment", "showSalary", "showSkills",
] as const;

function Segmented<T extends string>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: React.ElementType }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-1 rounded-[10px] bg-gray-100 dark:bg-gray-800">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15] ${
              active ? "bg-white dark:bg-gray-950 text-gray-900 dark:text-white shadow-sm" : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            <o.icon className="w-3.5 h-3.5" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const WidgetPreview = forwardRef<PreviewHandle, Props>(function WidgetPreview({
  widget, hasEvents, canManage, onResume, src, pagePath = "/events", itemsLabel = "with your real events", emptyNotice,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [theme, setTheme] = useState<"light" | "dark">(widget.darkMode === "dark" ? "dark" : "light");
  const [height, setHeight] = useState(360);
  const [nonce, setNonce] = useState(0);
  const latest = useRef<Record<string, unknown>>(widget as Record<string, unknown>);
  const frameSrc = src ?? `/embed/${widget.id}`;

  const send = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const cfg: Record<string, unknown> = {};
    for (const k of LOOK_KEYS) if (k in latest.current) cfg[k] = (latest.current as any)[k];
    const forced = latest.current.darkMode as string | undefined;
    cfg.darkMode = forced === "light" || forced === "dark" ? forced : theme;
    win.postMessage({ type: "udyaibase:preview-config", config: cfg }, window.location.origin);
  }, [theme]);

  useImperativeHandle(ref, () => ({
    pushConfig(c) {
      latest.current = { ...latest.current, ...c };
      if (c.darkMode === "dark" || c.darkMode === "light") setTheme(c.darkMode);
      send();
    },
    reload() {
      setNonce((n) => n + 1);
    },
  }), [send]);

  useEffect(() => {
    send();
  }, [send]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "udyaibase:resize" && typeof e.data.height === "number") setHeight(Math.max(240, e.data.height));
      if (e.data?.type === "udyaibase:preview-ready") send();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);

  const host = displayHost(widget.firstSeenHost) || "yourwebsite.com";
  const paused = !widget.active;

  return (
    <section aria-labelledby="preview-heading" className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1">
          <h2 id="preview-heading" className="portal-section-title">
            Live preview
            <span className="ml-2 font-normal text-gray-500">{itemsLabel}</span>
          </h2>
          <InfoTip label="Live preview">
            Shows exactly what visitors see, {itemsLabel.replace(/^with /, "using ")}. Changes appear here instantly and on your website within about a minute. Views here never count in your stats.
          </InfoTip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Device" value={device} onChange={setDevice} options={[
            { value: "desktop", label: "Desktop", icon: Monitor },
            { value: "mobile", label: "Mobile", icon: Smartphone },
          ]} />
          <Segmented label="Theme" value={theme} onChange={setTheme} options={[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
          ]} />
          <a href={`${frameSrc}#preview=1`} target="_blank" rel="noopener" className={btnGhost} aria-label="Open preview in a new tab">
            <ExternalLink className="w-4 h-4" aria-hidden />
          </a>
        </div>
      </div>

      <div className="bg-[#F7F7F9] dark:bg-gray-950 px-3 sm:px-6 py-5">
        <div
          className={`mx-auto transition-[max-width] duration-300 ${device === "mobile" ? "max-w-[390px]" : "max-w-full"}`}
        >
          <div className={`overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm ${device === "mobile" ? "rounded-[28px]" : "rounded-[12px]"} ${theme === "dark" ? "bg-[#0b0b0d]" : "bg-white"}`}>
            <div className={`flex items-center gap-2 px-3 h-9 border-b ${theme === "dark" ? "border-zinc-800 bg-zinc-900" : "border-gray-100 bg-gray-50"}`}>
              {device === "desktop" && (
                <span aria-hidden className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                </span>
              )}
              <span className={`flex-1 text-center text-[11px] truncate ${theme === "dark" ? "text-zinc-400" : "text-gray-500"}`}>
                {host}{pagePath}
              </span>
            </div>
            <div className={`${device === "mobile" ? "px-3" : "px-6"} py-5`}>
              <div aria-hidden className="mb-4 space-y-2">
                <div className={`h-3 w-32 rounded ${theme === "dark" ? "bg-zinc-800" : "bg-gray-200"}`} />
                <div className={`h-2 w-56 max-w-full rounded ${theme === "dark" ? "bg-zinc-800/70" : "bg-gray-100"}`} />
              </div>

              {paused ? (
                <div className="py-12 text-center">
                  <p className={`text-sm font-semibold ${theme === "dark" ? "text-zinc-200" : "text-gray-800"}`}>This widget is paused</p>
                  <p className={`text-sm mt-1 ${theme === "dark" ? "text-zinc-400" : "text-gray-600"}`}>
                    Visitors see nothing where the widget sits. No broken box, no error.
                  </p>
                  {canManage && (
                    <button onClick={onResume} className={`${btnPrimary} mt-4`}>
                      <Play className="w-4 h-4" aria-hidden /> Resume widget
                    </button>
                  )}
                </div>
              ) : (
                <iframe
                  key={nonce}
                  ref={iframeRef}
                  title="Widget preview"
                  src={`${frameSrc}#preview=1`}
                  className="block w-full border-0"
                  style={{ height }}
                />
              )}
            </div>
          </div>
        </div>

        {!hasEvents && !paused && emptyNotice}
        {!hasEvents && !paused && !emptyNotice && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-[12px] border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-4 py-3">
            <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
              <strong className="font-semibold">You don't have any upcoming public events yet.</strong>{" "}
              You can install the widget now. Events appear on your site the moment you publish them.
            </p>
            <Link href="/organizer/events/create" className={btnPrimary}>Create event</Link>
          </div>
        )}
      </div>
    </section>
  );
});

export default WidgetPreview;

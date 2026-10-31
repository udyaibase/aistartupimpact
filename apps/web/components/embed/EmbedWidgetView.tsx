"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmbedEventCard from "./EmbedEventCard";
import EmbedRegistrationForm from "./EmbedRegistrationForm";
import { accentText, BUTTON_SIZES, categoryLabel, onAccent, radii, SPACING } from "./embed-utils";
import { getEmbedFont, TEXT_SCALES } from "@/lib/embed/fonts";

export interface WidgetConfig {
  id: string;
  layout: "auto" | "grid" | "list" | "compact";
  accentColor: string;
  darkMode: "auto" | "light" | "dark";
  cornerStyle: "sharp" | "rounded" | "pill";
  buttonText: string;
  heading: string | null;
  subheading: string | null;
  headingAlign: "left" | "center";
  headingSize: "sm" | "md" | "lg";
  fontFamily: string;
  textScale: "sm" | "md" | "lg";
  showCover: boolean;
  showPrice: boolean;
  showSpotsLeft: boolean;
  showAttendeeCount: boolean;
  showCategory: boolean;
  buttonSize: "sm" | "md" | "lg";
  buttonStyle: "filled" | "outline" | "soft";
  cardStyle: "bordered" | "elevated" | "flat";
  spacing: "compact" | "comfortable" | "spacious";
  showPast: boolean;
  registrationMode: "inline" | "page";
  maxEvents: number;
  showPoweredBy: boolean;
  organizer: { id: string; name: string; company: string | null; avatar: string | null };
}

export interface EmbedEvent {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  category: string;
  format: string;
  startAt: string;
  endAt: string;
  timezone: string;
  venueName: string | null;
  address: string | null;
  coverImageUrl: string | null;
  capacity: number | null;
  registrationCount: number;
  registrationDeadline: string | null;
  approvalRequired: boolean;
  customQuestions: Array<{
    id: string;
    questionText: string;
    questionType: string;
    options: unknown;
    required: boolean;
    sortOrder: number;
  }>;
  ticketTiers: Array<{
    id: string;
    name: string;
    tierType: string;
    priceCents: number;
    quantity: number | null;
    soldCount: number;
    saleStart: string | null;
    saleEnd: string | null;
  }>;
}

export interface Attribution {
  referrerUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

interface Props {
  config: WidgetConfig;
  events: EmbedEvent[];
  pastEvents: EmbedEvent[];
}

const PREVIEW_KEYS: (keyof WidgetConfig)[] = [
  "layout", "accentColor", "darkMode", "cornerStyle", "buttonText", "showCover",
  "heading", "subheading", "headingAlign", "headingSize", "fontFamily", "textScale",
  "showPrice", "showSpotsLeft", "showAttendeeCount", "showCategory",
  "buttonSize", "buttonStyle", "cardStyle", "spacing", "showPast", "registrationMode", "maxEvents",
];

const THEMES = {
  light: { bg: "transparent", surface: "#ffffff", subtle: "#f4f4f5", text: "#18181b", muted: "#52525b", border: "#e4e4e7" },
  dark: { bg: "transparent", surface: "#18181b", subtle: "#27272a", text: "#fafafa", muted: "#a1a1aa", border: "#3f3f46" },
};

export default function EmbedWidgetView({ config: initialConfig, events, pastEvents }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState(initialConfig);
  const [isDark, setIsDark] = useState(initialConfig.darkMode === "dark");
  const [width, setWidth] = useState(0);
  const [category, setCategory] = useState<string>("ALL");
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<Attribution>({});
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => setConfig(initialConfig), [initialConfig]);

  useEffect(() => {
    if (config.darkMode !== "auto") {
      setIsDark(config.darkMode === "dark");
      return;
    }
    const siteTheme = new URLSearchParams(window.location.hash.slice(1)).get("theme");
    if (siteTheme === "dark" || siteTheme === "light") {
      setIsDark(siteTheme === "dark");
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [config.darkMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const ref = params.get("ref") || framedReferrer();
    setIsPreview(params.get("preview") === "1");
    setAttribution({
      referrerUrl: ref || undefined,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
    });
  }, []);

  // Live preview from the organizer portal (same origin only).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "udyaibase:preview-config" || typeof e.data.config !== "object") return;
      const patch: Partial<WidgetConfig> = {};
      for (const k of PREVIEW_KEYS) if (k in e.data.config) (patch as any)[k] = e.data.config[k];
      setConfig((c) => ({ ...c, ...patch }));
    }
    window.addEventListener("message", onMessage);
    if (window.parent !== window) window.parent.postMessage({ type: "udyaibase:preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      if (window.parent !== window) {
        window.parent.postMessage({ type: "udyaibase:resize", height: el.scrollHeight }, "*");
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isPreview || (navigator as any).webdriver) return;
    const ref = new URLSearchParams(window.location.hash.slice(1)).get("ref") || framedReferrer();
    if (!ref) return;
    fetch("/api/embed/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetId: config.id, eventIds: events.map((e) => e.id), ref }),
      keepalive: true,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview]);

  const font = getEmbedFont(config.fontFamily);

  // Load the chosen Google font once; the embed CSP already allows fonts.googleapis.com.
  useEffect(() => {
    if (!font.google) return;
    const id = `embed-font-${font.id}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
    document.head.appendChild(link);
  }, [font]);

  // Widget sizes are rem-based, so scaling the iframe's root font size scales all text.
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * (TEXT_SCALES[config.textScale] ?? 1)}px`;
  }, [config.textScale]);

  const categories = useMemo(() => {
    const set = Array.from(new Set(events.map((e) => e.category)));
    return set.length > 1 ? set : [];
  }, [events]);

  const filtered = category === "ALL" ? events : events.filter((e) => e.category === category);
  const visible = showAll ? filtered : filtered.slice(0, config.maxEvents);
  const hiddenCount = filtered.length - visible.length;
  const past = config.showPast || events.length === 0 ? pastEvents.slice(0, 3) : [];

  const layout = config.layout === "auto" ? (width >= 640 ? "grid" : "list") : config.layout;
  const r = radii(config.cornerStyle);
  const t = isDark ? THEMES.dark : THEMES.light;
  const org = config.organizer.company || config.organizer.name;
  const selected = events.find((e) => e.id === selectedId) || null;

  const scrollParentToTop = useCallback(() => {
    if (window.parent !== window) window.parent.postMessage({ type: "udyaibase:scroll-top" }, "*");
  }, []);

  function openEvent(e: EmbedEvent) {
    if (config.registrationMode === "page" || new Date(e.endAt).getTime() < Date.now()) {
      window.open(eventPageUrl(e, attribution), "_blank", "noopener");
      return;
    }
    setSelectedId(e.id);
    scrollParentToTop();
  }

  const style = {
    "--embed-accent": config.accentColor,
    "--embed-on-accent": onAccent(config.accentColor),
    "--w-surface": t.surface,
    "--w-subtle": t.subtle,
    "--w-text": t.text,
    "--w-muted": t.muted,
    "--w-border": t.border,
    "--r-card": r.card,
    "--r-control": r.control,
    "--r-button": r.button,
    "--embed-accent-text": accentText(config.accentColor, t.surface, t.text),
    "--btn-h": (BUTTON_SIZES[config.buttonSize] ?? BUTTON_SIZES.md).h,
    "--btn-px": (BUTTON_SIZES[config.buttonSize] ?? BUTTON_SIZES.md).px,
    "--btn-fs": (BUTTON_SIZES[config.buttonSize] ?? BUTTON_SIZES.md).fs,
    "--card-bg": config.cardStyle === "flat" ? t.subtle : t.surface,
    "--card-border": config.cardStyle === "bordered" || (config.cardStyle === "elevated" && isDark) ? t.border : "transparent",
    "--card-shadow": config.cardStyle === "elevated"
      ? isDark ? "0 1px 2px rgb(0 0 0 / .5), 0 6px 16px rgb(0 0 0 / .35)" : "0 1px 2px rgb(16 24 40 / .06), 0 6px 16px rgb(16 24 40 / .08)"
      : "none",
    colorScheme: isDark ? "dark" : "light",
    color: t.text,
    fontFamily: font.stack,
  } as React.CSSProperties;

  return (
    <div ref={rootRef} style={style} className="embed-root" data-btn={config.buttonStyle}>
      <style>{EMBED_CSS}</style>
      <div className="p-1">
        {selected ? (
          <EmbedRegistrationForm
            event={selected}
            widgetId={config.id}
            organizerName={org}
            attribution={attribution}
            onBack={() => { setSelectedId(null); scrollParentToTop(); }}
          />
        ) : (
          <>
            {(config.heading || config.subheading) && (
              <header className="mb-5" style={{ textAlign: config.headingAlign === "center" ? "center" : "left" }}>
                {config.heading && (
                  <h2
                    className={`font-bold tracking-tight leading-tight ${
                      config.headingSize === "sm" ? "text-lg" : config.headingSize === "lg" ? "text-3xl" : "text-2xl"
                    }`}
                  >
                    {config.heading}
                  </h2>
                )}
                {config.subheading && (
                  <p
                    className={`mt-1.5 text-base whitespace-pre-line ${config.headingAlign === "center" ? "mx-auto max-w-2xl" : "max-w-2xl"}`}
                    style={{ color: "var(--w-muted)" }}
                  >
                    {config.subheading}
                  </p>
                )}
              </header>
            )}

            {categories.length > 0 && (
              <div role="tablist" aria-label="Filter events" className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
                {["ALL", ...categories].map((c) => {
                  const active = category === c;
                  return (
                    <button
                      key={c}
                      role="tab"
                      aria-selected={active}
                      onClick={() => { setCategory(c); setShowAll(false); }}
                      className="embed-focus shrink-0 min-h-[36px] px-3.5 text-sm font-medium border transition-colors"
                      style={{
                        borderRadius: "999px",
                        borderColor: active ? "var(--embed-accent)" : "var(--w-border)",
                        background: active ? "var(--embed-accent)" : "var(--w-surface)",
                        color: active ? "var(--embed-on-accent)" : "var(--w-text)",
                      }}
                    >
                      {c === "ALL" ? "All" : categoryLabel(c)}
                    </button>
                  );
                })}
              </div>
            )}

            {visible.length === 0 ? (
              <div
                className="text-center px-6 py-10 border"
                style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}
              >
                <p className="text-base font-semibold">No upcoming events right now</p>
                <p className="text-sm mt-1" style={{ color: "var(--w-muted)" }}>
                  New events from {org} will appear here automatically.
                </p>
              </div>
            ) : (
              <ul
                className={
                  layout === "grid"
                    ? "grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))]"
                    : layout === "compact"
                      ? "flex flex-col border overflow-hidden"
                      : "flex flex-col"
                }
                style={layout === "compact"
                  ? { borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }
                  : { gap: (SPACING[config.spacing] ?? SPACING.comfortable)[layout === "grid" ? "grid" : "list"] }}
              >
                {visible.map((e) => (
                  <li key={e.id} className={layout === "compact" ? "border-b last:border-b-0" : ""} style={layout === "compact" ? { borderColor: "var(--w-border)" } : undefined}>
                    <EmbedEventCard event={e} layout={layout} config={config} onOpen={() => openEvent(e)} />
                  </li>
                ))}
              </ul>
            )}

            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAll(true)}
                className="embed-focus mt-3 w-full min-h-[44px] text-sm font-semibold border transition-colors"
                style={{ borderRadius: "var(--r-button)", borderColor: "var(--w-border)", background: "var(--w-surface)", color: "var(--w-text)" }}
              >
                View all {filtered.length} events
              </button>
            )}

            {past.length > 0 && (
              <section className="mt-6" aria-label="Past events">
                <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--w-muted)" }}>
                  {events.length === 0 ? "Recent events" : "Past events"}
                </h2>
                <ul className="flex flex-col border overflow-hidden" style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>
                  {past.map((e) => (
                    <li key={e.id} className="border-b last:border-b-0" style={{ borderColor: "var(--w-border)" }}>
                      <EmbedEventCard event={e} layout="compact" config={config} onOpen={() => openEvent(e)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {config.showPoweredBy && (
          <p className="mt-4 text-center text-xs" style={{ color: "var(--w-muted)" }}>
            <a
              href="https://udyaibase.com/?ref=widget"
              target="_blank"
              rel="noopener noreferrer"
              className="embed-focus inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
            >
              <img src="/branding_logo.svg" alt="" width={16} height={16} className="w-4 h-4 rounded-[4px]" />
              Powered by Udyaibase
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

/** Link-only installs (Notion, Google Sites) have no loader hash; fall back to the framing page. */
function framedReferrer(): string {
  return window.parent !== window && document.referrer ? document.referrer : "";
}

export function eventPageUrl(e: EmbedEvent, a: Attribution, extra: Record<string, string> = {}): string {
  const u = new URL(`/events/${e.slug}`, window.location.origin);
  u.searchParams.set("utm_source", a.utmSource || "widget");
  u.searchParams.set("utm_medium", a.utmMedium || "embed");
  if (a.utmCampaign) u.searchParams.set("utm_campaign", a.utmCampaign);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

export const EMBED_CSS = `
html, body { background: transparent !important; }
.embed-root { -webkit-font-smoothing: antialiased; line-height: 1.45; }
.embed-root h1, .embed-root h2, .embed-root h3, .embed-root button, .embed-root input, .embed-root select { font-family: inherit; }
.embed-root *:focus { outline: none; }
.embed-root .embed-focus:focus-visible, .embed-root input:focus-visible, .embed-root select:focus-visible, .embed-root textarea:focus-visible {
  outline: 2px solid var(--embed-accent); outline-offset: 2px;
}
.embed-root .embed-btn { background: var(--embed-accent); color: var(--embed-on-accent); border-radius: var(--r-button); }
.embed-root .embed-btn:hover:not(:disabled) { filter: brightness(0.92); }
.embed-root .embed-btn-size { min-height: var(--btn-h); padding-inline: var(--btn-px); font-size: var(--btn-fs); }
.embed-root[data-btn="outline"] .embed-btn { background: transparent; color: var(--embed-accent-text); box-shadow: inset 0 0 0 1.5px var(--embed-accent); }
.embed-root[data-btn="outline"] .embed-btn:hover:not(:disabled) { filter: none; background: color-mix(in srgb, var(--embed-accent) 8%, transparent); }
.embed-root[data-btn="soft"] .embed-btn { background: color-mix(in srgb, var(--embed-accent) 14%, var(--w-surface)); color: var(--embed-accent-text); }
.embed-root[data-btn="soft"] .embed-btn:hover:not(:disabled) { filter: none; background: color-mix(in srgb, var(--embed-accent) 22%, var(--w-surface)); }
.embed-root .embed-btn:disabled { opacity: .55; cursor: not-allowed; }
.embed-root .embed-btn-secondary { background: var(--w-surface); color: var(--w-text); border: 1px solid var(--w-border); border-radius: var(--r-button); }
.embed-root .embed-btn-secondary:hover:not(:disabled) { background: var(--w-subtle); }
.embed-root .embed-input { width: 100%; min-height: 44px; padding: 10px 12px; font-size: 0.9375rem; color: var(--w-text);
  background: var(--w-surface); border: 1px solid var(--w-border); border-radius: var(--r-control); }
.embed-root .embed-input::placeholder { color: var(--w-muted); opacity: .8; }
.embed-root .embed-input[aria-invalid="true"] { border-color: #dc2626; }
@media (prefers-reduced-motion: reduce) { .embed-root * { transition: none !important; animation: none !important; } }
`;

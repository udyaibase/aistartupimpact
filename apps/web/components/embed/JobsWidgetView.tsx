"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CareersJob, CareersSettings } from "@/lib/jobs/careers";
import NotifyForm from "@/components/careers/NotifyForm";
import { categoryText, EMPLOYMENT_TYPES, EXPERIENCE_BANDS } from "@/lib/jobs/composer";
import { getEmbedFont, TEXT_SCALES } from "@/lib/embed/fonts";
import { placeText, salaryText } from "@/lib/jobs/format";
import { EMBED_CSS } from "./EmbedWidgetView";
import JobDescription from "@/components/jobs/JobDescription";
import JobApplyForm, { type ApplyAttribution } from "@/components/jobs/apply/JobApplyForm";
import { applyConsentText } from "@/lib/jobs/consent";
import { accentText, BUTTON_SIZES, onAccent, radii, SPACING } from "./embed-utils";
import { googleFontHref, luminance, parseSiteHint, type SiteHint, type WidgetDesign } from "@/lib/jobs/widget-design";
import { parseApplyFormConfig, type ApplyFormConfig } from "@/lib/jobs/apply-form";

export interface JobsWidgetConfig {
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
  buttonSize: "sm" | "md" | "lg";
  buttonStyle: "filled" | "outline" | "soft";
  cardStyle: "bordered" | "elevated" | "flat";
  spacing: "compact" | "comfortable" | "spacious";
  maxJobs: number;
  showLogo: boolean;
  showDepartment: boolean;
  showSalary: boolean;
  showSkills: boolean;
  showPoweredBy: boolean;
  design: WidgetDesign;
  applyForm: ApplyFormConfig;
  /** perks: company-wide, set by the employer; shown on every job like on the Udyaibase job page. */
  company: { name: string; logoUrl: string | null; slug: string; perks?: string[]; /** Verified on Udyaibase (same rule as the job page). */ verified?: boolean };
  /** "Life at {company}" content, Notify me and general applications (same shape the employer portal edits). */
  careers: CareersSettings;
}

const PREVIEW_KEYS: (keyof JobsWidgetConfig)[] = [
  "layout", "accentColor", "darkMode", "cornerStyle", "buttonText", "heading", "subheading", "headingAlign", "headingSize",
  "fontFamily", "textScale", "buttonSize", "buttonStyle", "cardStyle", "spacing", "maxJobs",
  "showLogo", "showDepartment", "showSalary", "showSkills", "design", "applyForm", "careers",
];

/** Stands in on the Application form preview when no job is open yet. Never shown to candidates. */
const PREVIEW_JOB = { slug: "preview", title: "Your job title", skills: ["Python", "Machine learning", "SQL"], screeningQuestions: [] };

const THEMES = {
  light: { surface: "#ffffff", subtle: "#f4f4f5", text: "#18181b", muted: "#52525b", border: "#e4e4e7" },
  dark: { surface: "#18181b", subtle: "#27272a", text: "#fafafa", muted: "#a1a1aa", border: "#3f3f46" },
};

const label = (list: readonly { value: string; label: string }[], v: string | null) => (v ? list.find((x) => x.value === v)?.label : undefined);

function framedReferrer(): string {
  return window.parent !== window && document.referrer ? document.referrer : "";
}

/** The careers widget inside the iframe. Mirrors the events widget's layouts and styling options. */
export default function JobsWidgetView({ config: initial, jobs }: { config: JobsWidgetConfig; jobs: CareersJob[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState(initial);
  const [isDark, setIsDark] = useState(initial.darkMode === "dark");
  const [width, setWidth] = useState(0);
  const [team, setTeam] = useState("ALL");
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState(`?source=widget&w=${initial.id}`);
  const [attribution, setAttribution] = useState<ApplyAttribution>({ source: "widget", widgetId: initial.id });
  const [openId, setOpenId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  /** The Apply tab was opened for this job: its form stays mounted (hidden) so switching tabs keeps what was typed. */
  const [formOpened, setFormOpened] = useState(false);
  const [applied, setApplied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [search, setSearch] = useState("");
  const [place, setPlace] = useState("ALL");
  const [site, setSite] = useState<SiteHint>({});
  const [previewScreen, setPreviewScreen] = useState<"list" | "form-upload" | "form-details">("list");
  const [generalOpen, setGeneralOpen] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => setConfig(initial), [initial]);

  useEffect(() => {
    if (config.darkMode !== "auto") { setIsDark(config.darkMode === "dark"); return; }
    const siteTheme = new URLSearchParams(window.location.hash.slice(1)).get("theme");
    if (siteTheme === "dark" || siteTheme === "light") { setIsDark(siteTheme === "dark"); return; }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [config.darkMode]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const p = new URLSearchParams(window.location.hash.slice(1));
    setSite(parseSiteHint(p.get("site")));
    const q = new URLSearchParams({ source: "widget", w: initial.id });
    const ref = p.get("ref") || framedReferrer();
    if (ref) q.set("ref", ref);
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) { const v = p.get(k); if (v) q.set(k, v); }
    setQuery(`?${q.toString()}`);
    setAttribution({
      source: "widget", widgetId: initial.id, ref: ref || undefined,
      utm_source: p.get("utm_source") || undefined, utm_medium: p.get("utm_medium") || undefined, utm_campaign: p.get("utm_campaign") || undefined,
    });

    if (p.get("preview") === "1") setIsPreview(true);
    if (p.get("preview") === "1" || (navigator as any).webdriver || !ref) return;
    fetch("/api/embed/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "jobs", widgetId: initial.id, ref }),
      keepalive: true,
    }).catch(() => {});
  }, [initial.id]);

  // Live preview from the employer portal (same origin only).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "udyaibase:preview-config" || typeof e.data.config !== "object") return;
      const patch: Partial<JobsWidgetConfig> = {};
      for (const k of PREVIEW_KEYS) if (k in e.data.config) (patch as any)[k] = e.data.config[k];
      setConfig((c) => ({ ...c, ...patch }));
      const screen = e.data.config.previewScreen;
      if (screen === "list" || screen === "form-upload" || screen === "form-details") setPreviewScreen(screen);
    }
    window.addEventListener("message", onMessage);
    // Only Udyaibase's own preview listens for this. On a company's website the parent is another origin, and
    // posting to it just logged "target origin does not match" warnings in their console.
    if (parentIsUdyaibase()) window.parent.postMessage({ type: "udyaibase:preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      if (window.parent !== window) window.parent.postMessage({ type: "udyaibase:resize", height: el.scrollHeight }, "*");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Set by hand beats read from the page, so an employer can correct anything the automatic match gets wrong.
  const own = config.design ?? {};
  const live = own.matchSite ? site : {};
  const design: WidgetDesign = {
    ...own,
    font: own.font ?? live.font,
    headingFont: own.headingFont ?? live.headingFont,
    radius: own.radius ?? live.radius,
    colors: { ...(live.card ? { card: live.card } : {}), ...(live.text ? { text: live.text } : {}), ...own.colors },
  };
  const accent = live.accent ?? config.accentColor;
  const picked = getEmbedFont(config.fontFamily);
  const fontStack = design.font ? `"${design.font}", ${picked.stack}` : picked.stack;
  useEffect(() => {
    if (!picked.google || design.font) return;
    const id = `embed-font-${picked.id}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${picked.google}&display=swap`;
    document.head.appendChild(link);
  }, [picked, design.font]);

  // Any Google Font by name. Some have fewer weights, and Google refuses those requests, so retry without them.
  useEffect(() => {
    for (const name of [design.font, design.headingFont]) {
      if (!name) continue;
      const id = `embed-font-${name.replace(/\s+/g, "-")}`;
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = googleFontHref(name);
      link.onerror = () => { link.onerror = null; link.href = googleFontHref(name, false); };
      document.head.appendChild(link);
    }
  }, [design.font, design.headingFont]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * (TEXT_SCALES[config.textScale] ?? 1)}px`;
  }, [config.textScale]);

  const teams = useMemo(() => {
    const set = Array.from(new Set(jobs.map((j) => j.department).filter(Boolean))) as string[];
    return set.length > 1 && design.showTeamFilter !== false ? set : [];
  }, [jobs, design.showTeamFilter]);

  const places = useMemo(() => {
    const set = Array.from(new Set(jobs.map((j) => placeText(j)).filter(Boolean)));
    return set.length > 1 && design.showLocationFilter ? set.sort() : [];
  }, [jobs, design.showLocationFilter]);

  const q = search.trim().toLowerCase();
  const filtered = jobs.filter((j) =>
    (team === "ALL" || j.department === team)
    && (place === "ALL" || places.length === 0 || placeText(j) === place)
    && (!q || !design.showSearch || [j.title, j.department, ...j.skills].some((v) => v?.toLowerCase().includes(q))));
  const visible = showAll ? filtered : filtered.slice(0, config.maxJobs);
  const hiddenCount = filtered.length - visible.length;

  const layout = config.layout === "auto" ? (width >= 640 ? "grid" : "list") : config.layout;
  const r = design.radius !== undefined
    ? { card: `${design.radius}px`, control: `${Math.min(design.radius, 12)}px`, button: `${design.radius}px` }
    : radii(config.cornerStyle);
  // A company's own colours sit on top of the theme, and any left unset still come from it.
  const c = design.colors ?? {};
  const base = isDark ? THEMES.dark : THEMES.light;
  const t = {
    surface: c.card ?? base.surface,
    subtle: c.card ? `color-mix(in srgb, ${c.text ?? base.text} 7%, ${c.card})` : base.subtle,
    text: c.text ?? base.text,
    muted: c.muted ?? (c.text ? `color-mix(in srgb, ${c.text} 68%, ${c.card ?? base.surface})` : base.muted),
    border: c.border ?? (c.text ? `color-mix(in srgb, ${c.text} 16%, ${c.card ?? base.surface})` : base.border),
  };
  const darkSurface = c.card ? luminance(c.card) < 0.2 : isDark;
  const size = BUTTON_SIZES[config.buttonSize] ?? BUTTON_SIZES.md;

  const style = {
    "--embed-accent": accent,
    "--embed-on-accent": onAccent(accent),
    "--w-surface": t.surface,
    "--w-subtle": t.subtle,
    "--w-text": t.text,
    "--w-muted": t.muted,
    "--w-border": t.border,
    "--r-card": r.card,
    "--r-control": r.control,
    "--r-button": r.button,
    "--w-heading-font": design.headingFont ? `"${design.headingFont}", ${fontStack}` : "inherit",
    "--embed-accent-text": accentText(accent, c.card ?? base.surface, c.text ?? base.text),
    "--btn-h": size.h,
    "--btn-px": size.px,
    "--btn-fs": size.fs,
    "--card-bg": config.cardStyle === "flat" ? t.subtle : t.surface,
    "--card-border": config.cardStyle === "bordered" || (config.cardStyle === "elevated" && darkSurface) ? t.border : "transparent",
    "--card-shadow": config.cardStyle === "elevated"
      ? darkSurface ? "0 1px 2px rgb(0 0 0 / .5), 0 6px 16px rgb(0 0 0 / .35)" : "0 1px 2px rgb(16 24 40 / .06), 0 6px 16px rgb(16 24 40 / .08)"
      : "none",
    colorScheme: darkSurface ? "dark" : "light",
    color: t.text,
    fontFamily: fontStack,
    ...(c.background ? { background: c.background, padding: "1rem", borderRadius: r.card } : {}),
    ...(design.maxWidth ? { maxWidth: design.maxWidth, marginInline: "auto" } : {}),
  } as React.CSSProperties;

  const href = (j: CareersJob) => `${origin}/jobs/${j.slug}${query}`;
  const openJob = jobs.find((j) => j.id === openId) ?? null;
  const scrollParentToTop = () => { if (window.parent !== window) window.parent.postMessage({ type: "udyaibase:scroll-top" }, "*"); };
  const open = (j: CareersJob) => { setOpenId(j.id); setApplying(false); setFormOpened(false); setApplied(false); scrollParentToTop(); };
  const close = () => { setOpenId(null); setApplying(false); setFormOpened(false); setApplied(false); scrollParentToTop(); };
  const showTab = (apply: boolean) => { setApplying(apply); if (apply) setFormOpened(true); scrollParentToTop(); };
  const cardBox = { borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" };
  const formVars = {
    ["--af-text" as string]: "var(--w-text)", ["--af-muted" as string]: "var(--w-muted)", ["--af-border" as string]: "var(--w-border)",
    ["--af-surface" as string]: "var(--w-surface)", ["--af-subtle" as string]: "var(--w-subtle)", ["--af-accent" as string]: "var(--embed-accent)",
    ["--af-on-accent" as string]: "var(--embed-on-accent)", ["--af-radius" as string]: "var(--r-control)", ["--af-btn-radius" as string]: "var(--r-button)",
  };
  const previewingForm = previewScreen !== "list";
  const careers = config.careers;
  // The widget shows open roles only; the company story lives on the careers page template.
  const noRoles = jobs.length === 0;
  const generalSlug = careers?.acceptGeneral ? careers.generalSlug : null;
  const previewJob = jobs.find((j) => j.applicationType === "INTERNAL") ?? jobs[0];

  return (
    <div ref={rootRef} style={style} className="embed-root" data-btn={config.buttonStyle}>
      <style>{EMBED_CSS}</style>
      <style>{`.embed-description :is(h1,h2,h3,h4,p,li,strong,em,span){color:inherit}.embed-description{color:var(--w-text)}.embed-root h1,.embed-root h2,.embed-root h3{font-family:var(--w-heading-font)}`}</style>
      <div className="p-1">
        {previewingForm ? (
          <div className="border p-4 sm:p-6" style={cardBox}>
            <JobApplyForm
              variant="embed"
              preview={previewScreen === "form-upload" ? "upload" : "details"}
              job={{
                ...PREVIEW_JOB, ...(previewJob ? { slug: previewJob.slug, title: previewJob.title, skills: previewJob.skills, screeningQuestions: previewJob.screeningQuestions } : {}),
                company: config.company.name, consentText: applyConsentText(config.company.name), form: config.applyForm ?? parseApplyFormConfig(null),
              }}
              attribution={attribution}
              style={formVars}
            />
          </div>
        ) : openJob ? (
          <JobScreens
            job={openJob}
            tab={applying && openJob.applicationType === "INTERNAL" ? "apply" : "overview"}
            applied={applied}
            onTab={(t) => showTab(t === "apply")}
            onBack={close}
            overview={<JobDetail job={openJob} config={config} pageHref={href(openJob)} onApply={() => showTab(true)} />}
            form={formOpened && openJob.applicationType === "INTERNAL" ? (
              <div className="border p-4 sm:p-6" style={cardBox}>
                <JobApplyForm
                  variant="embed"
                  job={{
                    slug: openJob.slug, title: openJob.title, company: config.company.name, skills: openJob.skills,
                    screeningQuestions: openJob.screeningQuestions, consentText: applyConsentText(config.company.name),
                    form: config.applyForm,
                  }}
                  attribution={attribution}
                  onBack={close}
                  showBackLink={false}
                  onDone={() => setApplied(true)}
                  style={formVars}
                />
              </div>
            ) : null}
          />
        ) : generalOpen && generalSlug ? (
          <div className="border p-4 sm:p-6" style={cardBox}>
            <button type="button" onClick={() => { setGeneralOpen(false); scrollParentToTop(); }}
              className="embed-focus mb-3 text-sm font-semibold" style={{ color: "var(--embed-accent-text)" }}>← Back</button>
            <JobApplyForm
              variant="embed"
              job={{
                slug: generalSlug, title: "General application", company: config.company.name, skills: [], screeningQuestions: [],
                consentText: applyConsentText(config.company.name), form: config.applyForm,
              }}
              attribution={attribution}
              onBack={() => setGeneralOpen(false)}
              showBackLink={false}
              style={formVars}
            />
          </div>
        ) : (
        <>
        {(config.heading || config.subheading) && (
          <header className="mb-5" style={{ textAlign: config.headingAlign === "center" ? "center" : "left" }}>
            {config.heading && (
              <h2 className={`font-bold tracking-tight leading-tight ${config.headingSize === "sm" ? "text-lg" : config.headingSize === "lg" ? "text-3xl" : "text-2xl"}`}>
                {config.heading}
              </h2>
            )}
            {config.subheading && (
              <p className={`mt-1.5 text-base whitespace-pre-line ${config.headingAlign === "center" ? "mx-auto max-w-2xl" : "max-w-2xl"}`} style={{ color: "var(--w-muted)" }}>
                {config.subheading}
              </p>
            )}
          </header>
        )}

        {noRoles ? (
          <div className="flex flex-col gap-6">
            <div className="text-center px-6 py-10 border" style={cardBox}>
              <p className="text-base font-semibold">No open roles right now</p>
              <p className="text-sm mt-1" style={{ color: "var(--w-muted)" }}>
                {design.emptyText || `New jobs from ${config.company.name} will appear here automatically.`}
              </p>
            </div>
            <NotifyForm companySlug={config.company.slug} companyName={config.company.name} source="widget" preview={isPreview} />
            {generalSlug && (
              <div className="border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-3" style={cardBox}>
                <div className="flex-1">
                  <p className="font-semibold">Don’t want to wait?</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--w-muted)" }}>Send a general application and the {config.company.name} team will keep you in mind.</p>
                </div>
                <button type="button" onClick={() => { setGeneralOpen(true); scrollParentToTop(); }} className="embed-btn embed-btn-size embed-focus shrink-0 font-semibold">Apply generally</button>
              </div>
            )}
          </div>
        ) : (
        <div>
        {(design.showSearch || places.length > 0) && (
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            {design.showSearch && (
              <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setShowAll(false); }}
                placeholder="Search roles" aria-label="Search roles" className="embed-input embed-focus flex-1 min-w-0" />
            )}
            {places.length > 0 && (
              <select value={place} onChange={(e) => { setPlace(e.target.value); setShowAll(false); }} aria-label="Filter by location" className="embed-input embed-focus sm:w-56">
                <option value="ALL">All locations</option>
                {places.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        )}

        {teams.length > 0 && (
          <div role="tablist" aria-label="Filter by team" className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
            {["ALL", ...teams].map((c) => {
              const active = team === c;
              return (
                <button key={c} role="tab" aria-selected={active} onClick={() => { setTeam(c); setShowAll(false); }}
                  className="embed-focus shrink-0 min-h-[36px] px-3.5 text-sm font-medium border transition-colors"
                  style={{
                    borderRadius: "999px",
                    borderColor: active ? "var(--embed-accent)" : "var(--w-border)",
                    background: active ? "var(--embed-accent)" : "var(--w-surface)",
                    color: active ? "var(--embed-on-accent)" : "var(--w-text)",
                  }}>
                  {c === "ALL" ? "All teams" : c}
                </button>
              );
            })}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="text-center px-6 py-10 border" style={cardBox}>
            <p className="text-base font-semibold">No roles match your search</p>
            <p className="text-sm mt-1" style={{ color: "var(--w-muted)" }}>Try a different search or location.</p>
          </div>
        ) : (
          <ul
            className={layout === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))]" : layout === "compact" ? "flex flex-col border overflow-hidden" : "flex flex-col"}
            style={layout === "compact" ? cardBox : { gap: (SPACING[config.spacing] ?? SPACING.comfortable)[layout === "grid" ? "grid" : "list"] }}
          >
            {visible.map((j) => (
              <li key={j.id} className={layout === "compact" ? "border-b last:border-b-0" : ""} style={layout === "compact" ? { borderColor: "var(--w-border)" } : undefined}>
                <JobCard job={j} layout={layout} config={config} onOpen={() => open(j)} />
              </li>
            ))}
          </ul>
        )}

        {hiddenCount > 0 && (
          <button onClick={() => setShowAll(true)}
            className="embed-focus mt-3 w-full min-h-[44px] text-sm font-semibold border transition-colors"
            style={{ borderRadius: "var(--r-button)", borderColor: "var(--w-border)", background: "var(--w-surface)", color: "var(--w-text)" }}>
            View all {filtered.length} jobs
          </button>
        )}
        </div>
        )}
        </>
        )}

        {config.showPoweredBy && (
          <p className="mt-4 text-center text-xs" style={{ color: "var(--w-muted)" }}>
            <a href="https://udyaibase.com/?ref=widget" target="_blank" rel="noopener noreferrer" className="embed-focus inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/branding_logo.svg" alt="" width={16} height={16} className="w-4 h-4 rounded-[4px]" />
              Powered by Udyaibase
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

function Logo({ config, size }: { config: JobsWidgetConfig; size: "sm" | "md" }) {
  const dim = size === "sm" ? "w-10 h-10 text-base" : "w-14 h-14 text-xl";
  return (
    <span aria-hidden className={`${dim} shrink-0 flex items-center justify-center overflow-hidden border font-bold`}
      style={{ borderRadius: "var(--r-control)", borderColor: "var(--w-border)", background: "var(--w-surface)", color: "var(--w-muted)" }}>
      {config.company.logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={config.company.logoUrl} alt={`${config.company.name} logo`} className="w-full h-full object-cover" loading="lazy" />
        : config.company.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Blue tick: the company is verified on Udyaibase. */
const VerifiedTick = () => (
  <svg role="img" aria-label="Verified company" className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Verified on Udyaibase</title><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
);

const PinIcon = () => (
  <svg aria-hidden className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
);
const BagIcon = () => (
  <svg aria-hidden className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>
);

/**
 * An open job: "All jobs" to go back to the list, then two tabs for this job, Overview and Apply.
 * Tabs rather than breadcrumbs: the description and the form are two views of the same job, and candidates go back
 * and forth (checking requirements while answering questions). The form stays mounted while hidden, so switching
 * tabs never loses what was typed. Jobs that take applications elsewhere have no Apply tab.
 */
function JobScreens({ job, tab, applied, onTab, onBack, overview, form }: {
  job: CareersJob; tab: "overview" | "apply"; applied: boolean; onTab: (t: "overview" | "apply") => void; onBack: () => void;
  overview: React.ReactNode; form: React.ReactNode;
}) {
  const hasForm = job.applicationType === "INTERNAL";
  const tabs = hasForm ? (["overview", "apply"] as const) : (["overview"] as const);
  const names = { overview: "Overview", apply: applied ? "Applied" : "Apply" };
  const id = (t: string) => `job-${job.id}-${t}`;
  const keyNav = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = tabs.indexOf(tab as never);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onTab(tabs[next]);
    document.getElementById(`${id(tabs[next])}-tab`)?.focus();
  };
  return (
    <div>
      <button type="button" onClick={onBack} className="embed-focus inline-flex items-center gap-1.5 min-h-[40px] -ml-1 px-1 text-sm font-semibold" style={{ color: "var(--w-muted)" }}>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        All jobs
      </button>
      {hasForm && (
        <div role="tablist" aria-label={job.title} className="flex gap-1 mt-2 mb-4 border-b" style={{ borderColor: "var(--w-border)" }}>
          {tabs.map((t) => {
            const active = tab === t;
            return (
              <button
                key={t} type="button" role="tab" id={`${id(t)}-tab`} aria-selected={active} aria-controls={id(t)} tabIndex={active ? 0 : -1}
                onClick={() => onTab(t)} onKeyDown={keyNav}
                className="embed-focus inline-flex items-center gap-1.5 min-h-[44px] px-3 -mb-px text-sm font-semibold border-b-2 transition-colors"
                style={{ color: active ? "var(--w-text)" : "var(--w-muted)", borderColor: active ? "var(--embed-accent)" : "transparent" }}
              >
                {t === "apply" && applied && <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                {names[t]}
              </button>
            );
          })}
        </div>
      )}
      <div id={id("overview")} role={hasForm ? "tabpanel" : undefined} aria-labelledby={hasForm ? `${id("overview")}-tab` : undefined} hidden={tab !== "overview"} className={hasForm ? "" : "mt-2"}>
        {overview}
      </div>
      {hasForm && (
        <div id={id("apply")} role="tabpanel" aria-labelledby={`${id("apply")}-tab`} hidden={tab !== "apply"}>
          {form}
        </div>
      )}
    </div>
  );
}

const CheckIcon = () => (
  <svg aria-hidden className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
);

/** "3 days ago", the same wording as the job page on Udyaibase. */
function timeAgo(iso: string | null): string {
  if (!iso) return "Recently";
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w !== 1 ? "s" : ""} ago`; }
  const m = Math.floor(days / 30);
  return `${m} month${m !== 1 ? "s" : ""} ago`;
}

/**
 * One job, laid out like its page on Udyaibase (/jobs/[slug]) so a candidate sees the same thing in both places:
 * header with the key facts, About the Role, Perks & Benefits, Required Skills, then a single Apply.
 * Colours, corners and fonts still follow the widget's own design settings.
 */
function JobDetail({ job, config, pageHref, onApply }: {
  job: CareersJob; config: JobsWidgetConfig; pageHref: string; onApply: () => void;
}) {
  const salary = config.showSalary ? salaryText(job) : null;
  const experience = job.experienceMin != null
    ? `${job.experienceMin}–${job.experienceMax || "10+"} years`
    : label(EXPERIENCE_BANDS, job.experienceBand) ?? null;
  const type = label(EMPLOYMENT_TYPES, job.employmentType) ?? job.employmentType.replace(/_/g, " ").toLowerCase();
  const location = job.workType === "REMOTE" ? "Remote" : `${job.city || ""} ${job.country || ""}`.trim() || placeText(job);
  const perks = config.company.perks ?? [];
  const internal = job.applicationType === "INTERNAL";
  const card = { borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" };
  const sectionTitle = "text-base font-bold mb-3";
  const badge = "inline-flex items-center gap-1 px-2.5 py-1 text-[0.75rem] font-medium";
  const badgeStyle = { borderRadius: "var(--r-control)", background: "var(--w-subtle)", color: "var(--w-muted)" };
  const fact = (value: string, caption: string, big = false) => (
    <div>
      <p className={big ? "text-lg font-bold" : "text-sm font-bold"}>{value}</p>
      <p className="text-[0.625rem] uppercase tracking-wider" style={{ color: "var(--w-muted)" }}>{caption}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <article className="border p-4 sm:p-6" style={card}>
        <div className="flex items-start gap-3">
          {config.showLogo && <Logo config={config} size="md" />}
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight">{job.title}</h2>
            <p className="flex items-center gap-1 text-sm font-semibold mt-1" style={{ color: "var(--embed-accent-text)" }}>
              {config.company.name}
              {config.company.verified && <VerifiedTick />}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-4 border-t" style={{ borderColor: "var(--w-border)" }}>
          {salary && fact(`${salary}${job.hasEsops ? " + ESOPs" : ""}`, "per annum", true)}
          {fact(timeAgo(job.publishedAt), "posted")}
          {experience && fact(experience, "experience")}
          {fact(type, "type")}
          {job.positions > 1 && fact(String(job.positions), "openings")}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className={badge} style={badgeStyle}><PinIcon />{location}</span>
          <span className={badge} style={badgeStyle}>{categoryText(job.category, job.categoryLabel)}</span>
          {config.showDepartment && job.department && <span className={badge} style={badgeStyle}>{job.department}</span>}
          {job.visaSponsorship && <span className={badge} style={badgeStyle}>Visa Sponsorship</span>}
        </div>
      </article>

      {/* About the Role */}
      <section className="border p-4 sm:p-6" style={card}>
        <h3 className={sectionTitle}>About the Role</h3>
        {job.hiringManagerName && (
          <p className="text-sm -mt-1 mb-4" style={{ color: "var(--w-muted)" }}>Reports to <span className="font-semibold" style={{ color: "var(--w-text)" }}>{job.hiringManagerName}</span></p>
        )}
        <div className="text-[0.9375rem] embed-description"><JobDescription content={job.description} /></div>
      </section>

      {/* Perks & Benefits (company-wide, set by the employer) */}
      {perks.length > 0 && (
        <section className="border p-4 sm:p-6" style={card}>
          <h3 className={sectionTitle}>Perks &amp; Benefits</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {perks.map((perk) => <li key={perk} className="flex items-start gap-2 text-sm"><CheckIcon />{perk}</li>)}
          </ul>
        </section>
      )}

      {/* Required Skills */}
      {job.skills.length > 0 && (
        <section className="border p-4 sm:p-6" style={card}>
          <h3 className={sectionTitle}>Required Skills</h3>
          <div className="flex flex-wrap gap-2">
            {job.skills.map((s) => <span key={s} className={badge} style={badgeStyle}>{s}</span>)}
          </div>
        </section>
      )}

      {/* Apply (once, at the end, like the job page). No "View on Udyaibase" link: the candidate is already on the
          company's own site, which is the point of the widget. Udyaibase is credited by the "Powered by" line, which
          paid plans may hide; a link here would undo that. */}
      <section className="border p-4 sm:p-6" style={card}>
        <p className="text-base font-bold mb-1">Interested in this role?</p>
        <p className="text-xs mb-4" style={{ color: "var(--w-muted)" }}>Apply now. It only takes a few minutes.</p>
        {internal ? (
          <button type="button" onClick={onApply} className="embed-focus embed-btn embed-btn-size inline-flex items-center justify-center font-semibold whitespace-nowrap transition">Apply now</button>
        ) : (
          // The company's own application link; jobs that take applications by email have none, and their
          // Udyaibase page shows how to apply instead.
          <a href={job.applicationUrl || pageHref} target="_blank" rel="noopener" className="embed-focus embed-btn embed-btn-size inline-flex items-center justify-center font-semibold whitespace-nowrap transition">
            Apply now<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </section>
    </div>
  );
}

/** "5 openings" for roles hiring more than one person; nothing for a single hire. */
function openingsText(n: number | undefined): string | null {
  return n && n > 1 ? `${n} openings` : null;
}

function JobCard({ job, layout, config, onOpen }: { job: CareersJob; layout: "grid" | "list" | "compact"; config: JobsWidgetConfig; onOpen: () => void }) {
  const salary = config.showSalary ? salaryText(job) : null;
  const pay = salary ? `${salary}${job.hasEsops ? " + ESOPs" : ""}` : null;
  const kind = [label(EMPLOYMENT_TYPES, job.employmentType), job.experienceBand ? `${label(EXPERIENCE_BANDS, job.experienceBand)}` : null, openingsText(job.positions)].filter(Boolean).join(" · ");
  const btnText = config.buttonText || "View role";

  const button = (
    <button type="button" onClick={onOpen} aria-label={`${btnText}: ${job.title}`}
      className="embed-focus embed-btn embed-btn-size inline-flex items-center justify-center font-semibold whitespace-nowrap transition">
      {btnText}
    </button>
  );

  const skills = config.showSkills && job.skills.length > 0 && (
    <span className="flex flex-wrap gap-1.5">
      {job.skills.slice(0, 3).map((s) => (
        <span key={s} className="inline-flex items-center px-2 py-0.5 text-[0.75rem] font-medium leading-5" style={{ borderRadius: "999px", background: "var(--w-subtle)", color: "var(--w-muted)" }}>{s}</span>
      ))}
      {job.skills.length > 3 && <span className="text-[0.75rem] leading-5" style={{ color: "var(--w-muted)" }}>+{job.skills.length - 3}</span>}
    </span>
  );

  if (layout === "compact") {
    return (
      <article className="flex items-center gap-3 px-4 py-3">
        {config.showLogo && <Logo config={config} size="sm" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.9375rem] font-semibold leading-snug truncate">{job.title}</h3>
          <p className="text-[0.8125rem] truncate" style={{ color: "var(--w-muted)" }}>
            {placeText(job)}{config.showDepartment && job.department ? ` · ${job.department}` : ""}{job.positions > 1 ? ` · ${openingsText(job.positions)}` : ""}{pay ? ` · ${pay}` : ""}
          </p>
        </div>
        {button}
      </article>
    );
  }

  if (layout === "grid") {
    return (
      <article className="h-full flex flex-col overflow-hidden border" style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>
        <div className="flex-1 flex flex-col p-4 gap-2">
          <div className="flex items-start gap-3">
            {config.showLogo && <Logo config={config} size="sm" />}
            <div className="min-w-0">
              {config.showDepartment && job.department && (
                <p className="text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: "var(--w-muted)" }}>{job.department}</p>
              )}
              <h3 className="text-base font-semibold leading-snug line-clamp-2">{job.title}</h3>
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--w-muted)" }}>
            <span className="flex items-center gap-1.5"><PinIcon /><span className="truncate">{placeText(job)}</span></span>
            {kind && <span className="flex items-center gap-1.5 mt-0.5"><BagIcon /><span className="truncate">{kind}</span></span>}
          </p>
          {skills}
          <div className="mt-auto pt-2 flex items-center justify-between gap-3">
            {pay ? <span className="text-sm font-semibold">{pay}</span> : <span />}
            {button}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden border flex flex-col sm:flex-row sm:items-center sm:gap-4 sm:p-4"
      style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>
      <div className="flex items-start gap-4 min-w-0 flex-1 p-4 sm:p-0">
        {config.showLogo && <Logo config={config} size="md" />}
        <div className="min-w-0 flex-1">
          {config.showDepartment && job.department && (
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide mb-1 sm:mb-0.5" style={{ color: "var(--w-muted)" }}>{job.department}</p>
          )}
          <h3 className="text-base font-semibold leading-snug line-clamp-2">{job.title}</h3>
          <p className="flex items-center gap-1.5 text-sm mt-1.5 sm:mt-0.5 min-w-0" style={{ color: "var(--w-muted)" }}>
            <PinIcon /><span className="truncate">{placeText(job)}{kind ? ` · ${kind}` : ""}</span>
            {pay ? <span style={{ color: "var(--w-text)" }} className="hidden sm:inline font-semibold shrink-0"> · {pay}</span> : null}
          </p>
          {skills && <div className="mt-2 sm:mt-1.5">{skills}</div>}
        </div>
      </div>
      <div className="px-4 pb-4 sm:p-0 sm:shrink-0 flex items-center gap-3">
        {pay ? <span className="sm:hidden text-base font-semibold shrink-0">{pay}</span> : null}
        <div className="flex-1 sm:flex-none [&>button]:w-full sm:[&>button]:w-auto">{button}</div>
      </div>
    </article>
  );
}

/** True when this widget is framed by a Udyaibase page (the portal preview), not by a company's website. */
function parentIsUdyaibase(): boolean {
  try {
    return window.parent !== window && window.parent.location.origin === window.location.origin;
  } catch {
    return false; // reading another origin's location throws: a company's website
  }
}

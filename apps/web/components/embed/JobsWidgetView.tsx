"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CareersJob } from "@/lib/jobs/careers";
import { EMPLOYMENT_TYPES, EXPERIENCE_BANDS } from "@/lib/jobs/composer";
import { getEmbedFont, TEXT_SCALES } from "@/lib/embed/fonts";
import { placeText, salaryText } from "@/lib/jobs/format";
import { EMBED_CSS } from "./EmbedWidgetView";
import JobDescription from "@/components/jobs/JobDescription";
import JobApplyForm, { type ApplyAttribution } from "@/components/jobs/apply/JobApplyForm";
import { applyConsentText } from "@/lib/jobs/consent";
import { accentText, BUTTON_SIZES, onAccent, radii, SPACING } from "./embed-utils";

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
  company: { name: string; logoUrl: string | null; slug: string };
}

const PREVIEW_KEYS: (keyof JobsWidgetConfig)[] = [
  "layout", "accentColor", "darkMode", "cornerStyle", "buttonText", "heading", "subheading", "headingAlign", "headingSize",
  "fontFamily", "textScale", "buttonSize", "buttonStyle", "cardStyle", "spacing", "maxJobs",
  "showLogo", "showDepartment", "showSalary", "showSkills",
];

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
  const [origin, setOrigin] = useState("");

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
    const q = new URLSearchParams({ source: "widget", w: initial.id });
    const ref = p.get("ref") || framedReferrer();
    if (ref) q.set("ref", ref);
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) { const v = p.get(k); if (v) q.set(k, v); }
    setQuery(`?${q.toString()}`);
    setAttribution({
      source: "widget", widgetId: initial.id, ref: ref || undefined,
      utm_source: p.get("utm_source") || undefined, utm_medium: p.get("utm_medium") || undefined, utm_campaign: p.get("utm_campaign") || undefined,
    });

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
      if (window.parent !== window) window.parent.postMessage({ type: "udyaibase:resize", height: el.scrollHeight }, "*");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const font = getEmbedFont(config.fontFamily);
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

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * (TEXT_SCALES[config.textScale] ?? 1)}px`;
  }, [config.textScale]);

  const teams = useMemo(() => {
    const set = Array.from(new Set(jobs.map((j) => j.department).filter(Boolean))) as string[];
    return set.length > 1 ? set : [];
  }, [jobs]);

  const filtered = team === "ALL" ? jobs : jobs.filter((j) => j.department === team);
  const visible = showAll ? filtered : filtered.slice(0, config.maxJobs);
  const hiddenCount = filtered.length - visible.length;

  const layout = config.layout === "auto" ? (width >= 640 ? "grid" : "list") : config.layout;
  const r = radii(config.cornerStyle);
  const t = isDark ? THEMES.dark : THEMES.light;
  const size = BUTTON_SIZES[config.buttonSize] ?? BUTTON_SIZES.md;

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
    "--btn-h": size.h,
    "--btn-px": size.px,
    "--btn-fs": size.fs,
    "--card-bg": config.cardStyle === "flat" ? t.subtle : t.surface,
    "--card-border": config.cardStyle === "bordered" || (config.cardStyle === "elevated" && isDark) ? t.border : "transparent",
    "--card-shadow": config.cardStyle === "elevated"
      ? isDark ? "0 1px 2px rgb(0 0 0 / .5), 0 6px 16px rgb(0 0 0 / .35)" : "0 1px 2px rgb(16 24 40 / .06), 0 6px 16px rgb(16 24 40 / .08)"
      : "none",
    colorScheme: isDark ? "dark" : "light",
    color: t.text,
    fontFamily: font.stack,
  } as React.CSSProperties;

  const href = (j: CareersJob) => `${origin}/jobs/${j.slug}${query}`;
  const openJob = jobs.find((j) => j.id === openId) ?? null;
  const scrollParentToTop = () => { if (window.parent !== window) window.parent.postMessage({ type: "udyaibase:scroll-top" }, "*"); };
  const open = (j: CareersJob) => { setOpenId(j.id); setApplying(false); scrollParentToTop(); };
  const close = () => { setOpenId(null); setApplying(false); scrollParentToTop(); };
  const cardBox = { borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" };

  return (
    <div ref={rootRef} style={style} className="embed-root" data-btn={config.buttonStyle}>
      <style>{EMBED_CSS}</style>
      <style>{`.embed-description :is(h1,h2,h3,h4,p,li,strong,em,span){color:inherit}.embed-description{color:var(--w-text)}`}</style>
      <div className="p-1">
        {openJob ? (
          applying && openJob.applicationType === "INTERNAL" ? (
            <div className="border p-4 sm:p-6" style={cardBox}>
              <JobApplyForm
                variant="embed"
                job={{
                  slug: openJob.slug, title: openJob.title, company: config.company.name, skills: openJob.skills,
                  screeningQuestions: openJob.screeningQuestions, consentText: applyConsentText(config.company.name),
                }}
                attribution={attribution}
                onBack={close}
                style={{
                  ["--af-text" as string]: "var(--w-text)", ["--af-muted" as string]: "var(--w-muted)", ["--af-border" as string]: "var(--w-border)",
                  ["--af-surface" as string]: "var(--w-surface)", ["--af-subtle" as string]: "var(--w-subtle)", ["--af-accent" as string]: "var(--embed-accent)",
                  ["--af-on-accent" as string]: "var(--embed-on-accent)", ["--af-radius" as string]: "var(--r-control)", ["--af-btn-radius" as string]: "var(--r-button)",
                }}
              />
            </div>
          ) : (
            <JobDetail job={openJob} config={config} pageHref={href(openJob)} onBack={close} onApply={() => { setApplying(true); scrollParentToTop(); }} />
          )
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
            <p className="text-base font-semibold">No open roles right now</p>
            <p className="text-sm mt-1" style={{ color: "var(--w-muted)" }}>New jobs from {config.company.name} will appear here automatically.</p>
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
        ? <img src={config.company.logoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        : config.company.name.charAt(0).toUpperCase()}
    </span>
  );
}

const PinIcon = () => (
  <svg aria-hidden className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
);
const BagIcon = () => (
  <svg aria-hidden className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>
);

function JobDetail({ job, config, pageHref, onBack, onApply }: {
  job: CareersJob; config: JobsWidgetConfig; pageHref: string; onBack: () => void; onApply: () => void;
}) {
  const salary = config.showSalary ? salaryText(job) : null;
  const kind = [label(EMPLOYMENT_TYPES, job.employmentType), job.experienceBand ? `${label(EXPERIENCE_BANDS, job.experienceBand)}` : null].filter(Boolean).join(" · ");
  const internal = job.applicationType === "INTERNAL";
  const applyButton = internal ? (
    <button type="button" onClick={onApply} className="embed-focus embed-btn embed-btn-size inline-flex items-center justify-center font-semibold whitespace-nowrap transition">Apply now</button>
  ) : (
    <a href={job.applicationUrl || pageHref} target="_blank" rel="noopener" className="embed-focus embed-btn embed-btn-size inline-flex items-center justify-center font-semibold whitespace-nowrap transition">
      Apply on company site<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
  return (
    <article className="border p-4 sm:p-6" style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>
      <button type="button" onClick={onBack} className="embed-focus inline-flex items-center gap-1.5 min-h-[40px] -ml-1 px-1 text-sm font-semibold" style={{ color: "var(--w-muted)" }}>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Back to jobs
      </button>
      <div className="flex items-start gap-3 mt-2">
        {config.showLogo && <Logo config={config} size="md" />}
        <div className="min-w-0">
          {job.department && <p className="text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: "var(--w-muted)" }}>{job.department}</p>}
          <h2 className="text-xl font-bold leading-tight">{job.title}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--w-muted)" }}>{config.company.name} · {placeText(job)}{kind ? ` · ${kind}` : ""}</p>
          {salary && <p className="text-sm font-semibold mt-1">{salary}{job.hasEsops ? " + ESOPs" : ""}</p>}
        </div>
      </div>
      <div className="mt-4">{applyButton}</div>
      {job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {job.skills.map((s) => (
            <span key={s} className="inline-flex items-center px-2 py-0.5 text-[0.75rem] font-medium leading-5" style={{ borderRadius: "999px", background: "var(--w-subtle)", color: "var(--w-muted)" }}>{s}</span>
          ))}
        </div>
      )}
      <div className="mt-5 pt-5 border-t text-[0.9375rem] embed-description" style={{ borderColor: "var(--w-border)" }}>
        <JobDescription content={job.description} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {applyButton}
        <a href={pageHref} target="_blank" rel="noopener" className="embed-focus text-sm font-semibold underline-offset-2 hover:underline" style={{ color: "var(--embed-accent-text)" }}>
          View on Udyaibase<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </article>
  );
}

function JobCard({ job, layout, config, onOpen }: { job: CareersJob; layout: "grid" | "list" | "compact"; config: JobsWidgetConfig; onOpen: () => void }) {
  const salary = config.showSalary ? salaryText(job) : null;
  const pay = salary ? `${salary}${job.hasEsops ? " + ESOPs" : ""}` : null;
  const kind = [label(EMPLOYMENT_TYPES, job.employmentType), job.experienceBand ? `${label(EXPERIENCE_BANDS, job.experienceBand)}` : null].filter(Boolean).join(" · ");
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
            {placeText(job)}{config.showDepartment && job.department ? ` · ${job.department}` : ""}{pay ? ` · ${pay}` : ""}
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

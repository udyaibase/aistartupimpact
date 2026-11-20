"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, Globe, LayoutTemplate, Sparkles, X } from "lucide-react";
import type { CareersSettings } from "@/lib/jobs/careers";
import {
  isStarter, orderFor, starterHeadline, TEMPLATE_INFO, TEMPLATES, withStarter, type CareersTemplate, type SectionType,
} from "@/lib/jobs/careers-content";
import CareersPage, { type CareersPageData } from "@/components/careers/CareersPage";
import { input as inputCls, card, btnPrimary, btnSecondary } from "@/components/organizer/embed/ui";
import { SaveIndicator, Switch, type SaveState } from "@/components/organizer/embed/CustomizePanel";
import CompanyPageSection from "./CompanyPageSection";
import DevicePreview from "./DevicePreview";

const API = "/api/employer/careers/page";
const SWATCHES = ["#a50f15", "#111827", "#1d4ed8", "#047857", "#7c3aed", "#c2410c", "#0f766e", "#be185d"];

/** What makes a careers page convincing, in the order worth doing it. Each step opens the right section. */
function nextSteps(c: CareersSettings, company: string): { label: string; type: SectionType; done: boolean }[] {
  const sec = (t: SectionType) => c.content.sections.find((s) => s.type === t && s.enabled);
  const own = (t: SectionType) => { const s = sec(t); return !!s && !isStarter(s, company); };
  const mission = sec("mission");
  const values = sec("values");
  const process = sec("process");
  const voices = sec("voices");
  return [
    { label: "Write your headline", type: "intro", done: !!c.headline.trim() && c.headline !== starterHeadline(company) && !!sec("intro") },
    { label: "Make the mission yours", type: "mission", done: mission?.type === "mission" && !!mission.statement.trim() && own("mission") },
    { label: "Write your values", type: "values", done: values?.type === "values" && values.items.some((i) => i.name.trim()) && own("values") },
    { label: "Pick your perks", type: "perks", done: c.perks.length > 0 && !!sec("perks") },
    { label: "Describe how you hire", type: "process", done: process?.type === "process" && process.items.some((i) => i.name.trim()) && own("process") },
    { label: "Quote a teammate", type: "voices", done: voices?.type === "voices" && voices.quotes.some((q) => q.quote.trim() && q.name.trim()) },
  ];
}

/** A real, scaled-down render of a template with the company's details (non-interactive). */
function TemplateThumb({ data }: { data: CareersPageData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = w / 1280;
  return (
    <div ref={ref} aria-hidden className="relative w-full aspect-[4/3] overflow-hidden rounded-[10px] border border-gray-200 dark:border-gray-800 bg-white">
      {w > 0 && (
        <div inert className="absolute top-0 left-0 pointer-events-none select-none" style={{ width: 1280, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <div className="p-8"><CareersPage data={data} preview theme="light" /></div>
        </div>
      )}
    </div>
  );
}

export default function CareersPageEditor({ initial, page, pageUrl, isNew, canHideBranding }: {
  initial: CareersSettings;
  page: CareersPageData;
  pageUrl: string;
  /** Nothing saved yet: start by choosing a template. */
  isNew: boolean;
  canHideBranding: boolean;
}) {
  const [careers, setCareers] = useState(initial);
  const [fresh, setFresh] = useState(isNew);
  const [step, setStep] = useState<"choose" | "edit">(isNew ? "choose" : "edit");
  const [previewing, setPreviewing] = useState<CareersTemplate | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const pending = useRef<CareersSettings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hexDraft, setHexDraft] = useState(initial.brandColor);
  const [focus, setFocus] = useState<{ type: SectionType; n: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const company = page.name;
  const steps = nextSteps(careers, company);
  const doneCount = steps.filter((x) => x.done).length;

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const res = await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) throw new Error(d.error || "Couldn't save");
      setSaveState("saved");
      setSaveError("");
      if (d.data?.generalSlug) setCareers((c) => ({ ...c, generalSlug: d.data.generalSlug }));
    } catch (err) {
      pending.current = pending.current ?? next;
      setSaveError(err instanceof Error ? err.message : "Couldn't save");
      setSaveState("error");
    }
  }, []);

  const update = useCallback((next: CareersSettings) => {
    setCareers(next);
    pending.current = next;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [flush]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => { if (pending.current) e.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  /** The page as candidates would see it with these settings. */
  const dataFor = (c: CareersSettings): CareersPageData => ({
    ...page,
    brandColor: c.brandColor, headline: c.headline, description: c.description, perks: c.perks, content: c.content,
    general: c.acceptGeneral ? { slug: c.generalSlug ?? "preview" } : null,
    showPoweredBy: !(canHideBranding && c.content.hideBranding),
  });

  /** A template with starter text in any empty section (what choosing it would give), for the gallery previews. */
  const withTemplate = (t: CareersTemplate): CareersSettings => ({
    ...careers,
    headline: careers.headline.trim() ? careers.headline : starterHeadline(company),
    content: withStarter({ ...careers.content, template: t, sections: orderFor(t, careers.content.sections) }, company),
  });

  const choose = (t: CareersTemplate) => {
    update(withTemplate(t));
    setFresh(false);
    setPreviewing(null);
    setStep("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${pageUrl}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  const setBrand = (hex: string) => { setHexDraft(hex); if (/^#[0-9a-f]{6}$/i.test(hex)) update({ ...careers, brandColor: hex.toLowerCase() }); };
  const hasStarter = careers.headline === starterHeadline(company) || careers.content.sections.some((s) => s.enabled && isStarter(s, company));

  const header = (
    <header className="flex flex-col sm:flex-row sm:items-start gap-3 mb-6">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Step {step === "choose" ? 1 : 2} of 2</p>
        <h1 className="portal-title">{step === "choose" ? "Choose a template" : "Make it yours"}</h1>
        <p className="portal-subtitle">
          {step === "choose"
            ? "Every template uses your details and open roles. You can switch later without losing your text."
            : "Edit the text and see it live on desktop, tablet and mobile. Changes save automatically."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <SaveIndicator state={saveState} error={saveError} onRetry={() => { pending.current = pending.current ?? careers; flush(); }} />
        {step === "edit" && (
          <a href={pageUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            View page <ExternalLink className="w-4 h-4" aria-hidden />
          </a>
        )}
      </div>
    </header>
  );

  // ── Step 1: template gallery ──────────────────────
  if (step === "choose") {
    const current = careers.content.template;
    return (
      <div className="font-jakarta pb-12">
        {header}
        {!fresh && (
          <button type="button" onClick={() => setStep("edit")} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-[#A50F15]">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Back to editing
          </button>
        )}
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {TEMPLATES.map((t) => {
            const isCurrent = !fresh && t === current;
            return (
              <li key={t} className={`${card} p-3 flex flex-col ${isCurrent ? "ring-2 ring-[#A50F15]" : ""}`}>
                {/* The thumbnail is a live render with its own buttons, so it can't sit inside a <button> (invalid HTML,
                    hydration error). It's inert; a sibling button laid over it opens the preview. */}
                <div className="relative rounded-[10px]">
                  <div inert aria-hidden="true"><TemplateThumb data={dataFor(withTemplate(t))} /></div>
                  <button type="button" onClick={() => setPreviewing(t)} className="absolute inset-0 rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15]"
                    aria-label={`Preview the ${TEMPLATE_INFO[t].label} template`} />
                </div>
                <div className="px-1 pt-3 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    {TEMPLATE_INFO[t].label}
                    {isCurrent && <span className="text-xs font-semibold text-[#A50F15] bg-[#A50F15]/10 rounded-full px-2 py-0.5">Current</span>}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{TEMPLATE_INFO[t].blurb}</p>
                </div>
                <div className="px-1 pt-3 flex gap-2">
                  <button type="button" onClick={() => choose(t)} className={`${btnPrimary} flex-1`}>{isCurrent ? "Keep this template" : "Use this template"}</button>
                  <button type="button" onClick={() => setPreviewing(t)} className={btnSecondary}>Preview</button>
                </div>
              </li>
            );
          })}
        </ul>

        {previewing && (
          <div role="dialog" aria-modal="true" aria-labelledby="tpl-preview-h" className="fixed inset-0 z-modal flex items-stretch sm:items-center justify-center bg-black/50 p-0 sm:p-6"
            onKeyDown={(e) => e.key === "Escape" && setPreviewing(null)}>
            <div className="bg-white dark:bg-gray-950 w-full max-w-6xl sm:rounded-[16px] flex flex-col max-h-full">
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                <h2 id="tpl-preview-h" className="flex-1 portal-dialog-title">{TEMPLATE_INFO[previewing].label} template</h2>
                <button type="button" onClick={() => choose(previewing)} className={btnPrimary}>Use this template</button>
                <button type="button" onClick={() => setPreviewing(null)} aria-label="Close preview" autoFocus className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] text-gray-500 hover:text-gray-900 dark:hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 sm:p-5 overflow-y-auto">
                <DevicePreview data={dataFor(withTemplate(previewing))} compact />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: content ───────────────────────────────
  const data = dataFor(careers);
  return (
    <div className="font-jakarta pb-12">
      {header}

      <div className={`${card} mb-6 p-4 flex flex-wrap items-center gap-3`}>
        <LayoutTemplate className="w-5 h-5 text-[#A50F15]" aria-hidden />
        <p className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300">
          Template: <span className="font-semibold text-gray-900 dark:text-white">{TEMPLATE_INFO[careers.content.template].label}</span>
        </p>
        <button type="button" onClick={() => { setStep("choose"); window.scrollTo({ top: 0 }); }} className={btnSecondary}>Change template</button>
      </div>

      {hasStarter && (
        <p role="status" className="mb-6 flex items-start gap-2.5 rounded-[12px] border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          We added starter text so your page doesn’t start empty. Replace it with your own words before you share the page.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <section aria-labelledby="steps-h" className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="steps-h" className="portal-section-title">{doneCount === steps.length ? "Your page is complete" : "Make your page stand out"}</h2>
              <span className="text-xs font-semibold text-gray-500">{doneCount} of {steps.length}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" aria-hidden>
              <div className="h-full bg-[#A50F15] transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {steps.map((x) => (
                <li key={x.type}>
                  <button type="button" onClick={() => setFocus((f) => ({ type: x.type, n: (f?.n ?? 0) + 1 }))}
                    className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full border text-sm transition-colors ${
                      x.done ? "border-green-200 dark:border-green-900/50 text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-900/20" : "border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:border-[#A50F15] hover:text-[#A50F15]"
                    }`}>
                    {x.done && <Check className="w-3.5 h-3.5" aria-hidden />}{x.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="content-h" className={`${card} p-5`}>
            <h2 id="content-h" className="portal-section-title mb-3">Content</h2>
            <CompanyPageSection careers={careers} companyName={company} onChange={update} focus={focus} />
          </section>

          <section aria-labelledby="brand-h" className={`${card} p-5`}>
            <h2 id="brand-h" className="portal-section-title">Brand colour</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setBrand(c)} aria-label={`Use ${c}`} aria-pressed={careers.brandColor === c}
                  className={`w-8 h-8 rounded-full border-2 ${careers.brandColor === c ? "border-gray-900 dark:border-white" : "border-transparent"}`} style={{ background: c }} />
              ))}
              <label className="flex items-center gap-2 ml-1">
                <span className="sr-only">Custom colour</span>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(hexDraft) ? hexDraft : careers.brandColor} onChange={(e) => setBrand(e.target.value)} className="w-9 h-9 rounded cursor-pointer bg-transparent" />
                <input value={hexDraft} onChange={(e) => setBrand(e.target.value.trim())} maxLength={7} aria-label="Brand colour hex code"
                  aria-invalid={!/^#[0-9a-f]{6}$/i.test(hexDraft)} className={`${inputCls} w-28 font-mono`} />
              </label>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-[10px] border border-gray-200 dark:border-gray-800 pl-3 pr-2">
              <span className="py-2">
                <span className="block text-sm text-gray-800 dark:text-gray-200">Show “Powered by Udyaibase”</span>
                {!canHideBranding && <span className="block text-xs text-gray-500"><Link href="/employer/billing" className="underline">Upgrade</Link> to remove it</span>}
              </span>
              {canHideBranding
                ? <Switch checked={!careers.content.hideBranding} label="Show Powered by Udyaibase" onChange={(v) => update({ ...careers, content: { ...careers.content, hideBranding: !v } })} />
                : <span className="text-xs font-semibold text-gray-500 pr-1">On</span>}
            </div>
          </section>

          <section aria-labelledby="share-h" className={`${card} p-5`}>
            <h2 id="share-h" className="portal-section-title">Share your page</h2>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-[10px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-200">udyaibase.com{pageUrl}</code>
              <button type="button" onClick={copyLink} className="shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-[#A50F15] text-white text-sm font-semibold hover:bg-[#8a0c11]">
                {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}{copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Point your website’s “Careers” button at this link, or share it on LinkedIn.</p>
            <Link href="/employer/careers" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#A50F15] hover:underline">
              <Globe className="w-4 h-4" aria-hidden /> Or show it inside your website
            </Link>
          </section>
        </div>

        <section aria-label="Live preview" className="min-w-0 xl:sticky xl:top-20">
          <DevicePreview data={data} />
        </section>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Search, X, AlertCircle, Loader2 } from "lucide-react";
import type { PortalEventOption, PortalWidget } from "@/lib/embed/portal-data";
import { btnGhost, btnSecondary, input } from "./ui";
import { EMBED_FONTS, getEmbedFont } from "@/lib/embed/fonts";
import InfoTip from "./InfoTip";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Look settings shared by the events and careers widgets. */
export interface LookWidget {
  heading: string | null;
  subheading: string | null;
  headingAlign: string;
  headingSize: string;
  accentColor: string;
  darkMode: string;
  cornerStyle: string;
  fontFamily: string;
  textScale: string;
  buttonText: string;
  buttonSize: string;
  buttonStyle: string;
}

interface Props {
  widget: PortalWidget;
  events: PortalEventOption[];
  canManage: boolean;
  saveState: SaveState;
  saveError: string;
  onChange: (patch: Partial<PortalWidget>) => void;
  onRetry: () => void;
  onClose: () => void;
  showName: boolean;
}

const SWATCHES = ["#A50F15", "#111827", "#2563EB", "#4F46E5", "#7C3AED", "#DB2777", "#EA580C", "#B45309", "#15803D", "#0F766E"];
const CATEGORIES = ["HACKATHON", "MEETUP", "WORKSHOP", "CONFERENCE", "SUMMIT", "DEMO_DAY", "WEBINAR", "NETWORKING"];
const BUTTON_LABELS = [
  "Register", "RSVP", "Get tickets", "Book now", "Reserve a spot",
  "Sign up", "Join event", "Apply now", "Request invite", "Learn more",
];

export const OPT = {
  theme: { auto: "Auto", light: "Light", dark: "Dark" },
  spacing: { compact: "Compact", comfortable: "Comfortable", spacious: "Spacious" },
  cardStyle: { bordered: "Bordered", elevated: "Elevated", flat: "Flat" },
  buttonSize: { sm: "Small", md: "Medium", lg: "Large" },
  buttonStyle: { filled: "Filled", outline: "Outline", soft: "Soft" },
} as const;
const DOMAIN_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function label(c: string) {
  return c.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
}

export default function CustomizePanel({
  widget, events, canManage, saveState, saveError, onChange, onRetry, onClose, showName,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const filterMode = widget.eventIds.length > 0 ? "picked" : widget.categories.length > 0 ? "category" : "all";
  const disabled = !canManage;

  // Parent re-renders on every keystroke (autosave), so keep these effects mount-only.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const eventsSummary =
    filterMode === "picked"
      ? `${widget.eventIds.length} selected event${widget.eventIds.length === 1 ? "" : "s"}`
      : filterMode === "category"
        ? widget.categories.map(label).join(", ")
        : "All upcoming events";
  const layoutLabel = { auto: "Auto", grid: "Grid", list: "List", compact: "Compact" }[widget.layout as "auto"] ?? widget.layout;

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/30 lg:bg-black/10" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-title"
        className="fixed inset-y-0 right-0 z-modal w-full sm:w-[440px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 flex flex-col font-jakarta shadow-xl"
      >
        <header className="flex items-center gap-3 px-4 sm:px-5 min-h-[4rem] shrink-0 border-b border-gray-100 dark:border-gray-800" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <h2 id="customize-title" className="portal-section-title flex-1">Customize</h2>
          <SaveIndicator state={saveState} error={saveError} onRetry={onRetry} />
          <button ref={closeRef} onClick={onClose} className={btnGhost} aria-label="Close customize panel">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {!canManage && (
            <p className="mx-5 mt-4 rounded-[10px] bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              You have view-only access. Ask an owner, admin or manager to make changes.
            </p>
          )}

          {showName && (
            <div className="px-5 pt-5">
              <label htmlFor="w-name" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Widget name</label>
              <input id="w-name" className={input} defaultValue={widget.name} maxLength={60} disabled={disabled}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== widget.name && onChange({ name: e.target.value.trim() })} />
              <p className="mt-1 text-xs text-gray-500">Only visible to your team. Helps you tell widgets apart.</p>
            </div>
          )}

          <Group id="header" title="Header"
            summary={widget.heading ? `“${widget.heading}”` : "No title"} open={open} setOpen={setOpen}>
            <HeaderSection widget={widget} disabled={disabled} onChange={onChange} />
          </Group>

          <Group id="events" title="Events" summary={`${eventsSummary} · up to ${widget.maxEvents}`} open={open} setOpen={setOpen}>
            <EventsSection widget={widget} events={events} mode={filterMode} disabled={disabled} onChange={onChange} />
          </Group>

          <Group id="layout" title="Layout"
            summary={`${layoutLabel} · ${OPT.spacing[widget.spacing as keyof typeof OPT.spacing] ?? "Comfortable"} spacing · ${OPT.cardStyle[widget.cardStyle as keyof typeof OPT.cardStyle] ?? "Bordered"} cards`}
            open={open} setOpen={setOpen}>
            <LayoutSection widget={widget} disabled={disabled} onChange={onChange} />
          </Group>

          <Group id="appearance" title="Appearance"
            summary={`${OPT.theme[widget.darkMode as keyof typeof OPT.theme] ?? "Auto"} theme · ${widget.accentColor.toUpperCase()} · ${getEmbedFont(widget.fontFamily).label}`}
            open={open} setOpen={setOpen}>
            <AppearanceSection widget={widget} disabled={disabled} onChange={onChange} />
          </Group>

          <Group id="button" title="Button"
            summary={`“${widget.buttonText}” · ${OPT.buttonSize[widget.buttonSize as keyof typeof OPT.buttonSize] ?? "Medium"} · ${OPT.buttonStyle[widget.buttonStyle as keyof typeof OPT.buttonStyle] ?? "Filled"}`}
            open={open} setOpen={setOpen}>
            <ButtonSection widget={widget} disabled={disabled} onChange={onChange} />
          </Group>

          <Group id="registration" title="Registration"
            summary={widget.registrationMode === "inline" ? "In the widget" : "On the event page"} open={open} setOpen={setOpen}>
            <Field label="Registration flow" info="In the widget keeps visitors on your website, which usually means more registrations. On the event page shows full details such as agenda and speakers.">
              <Choice
                name="reg-mode"
                value={widget.registrationMode}
                disabled={disabled}
                onChange={(v) => onChange({ registrationMode: v })}
                options={[
                  { value: "inline", title: "In the widget (recommended)", desc: "Visitors register without leaving your website." },
                  { value: "page", title: "On the event page", desc: "Opens the full event page on Udyaibase in a new tab." },
                ]}
              />
            </Field>
            <p className="mt-3 text-xs text-gray-500">Paid tickets always complete checkout in a secure window on udyaibase.com.</p>
          </Group>

          <Group id="sites" title="Allowed domains"
            summary={widget.allowedDomains.length ? widget.allowedDomains.join(", ") : "All domains"} open={open} setOpen={setOpen}>
            <DomainsSection domains={widget.allowedDomains} disabled={disabled} onChange={(d) => onChange({ allowedDomains: d })} />
          </Group>

          <Group id="branding" title="Branding" summary="Powered by Udyaibase" open={open} setOpen={setOpen}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Show “Powered by Udyaibase”</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Always shown on the free plan.</p>
              </div>
              <Switch checked disabled label="Show Powered by Udyaibase" onChange={() => {}} />
            </div>
            <Link href="/organizer/support?topic=branding" className="inline-block mt-3 text-sm font-semibold text-[#A50F15] hover:underline">
              Contact us about removing branding
            </Link>
          </Group>

          <p className="px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-xs text-gray-500">
            Changes save automatically and appear on your website within about a minute.
          </p>
        </div>
      </aside>
    </>
  );
}

export function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string; onRetry: () => void }) {
  return (
    <span role="status" aria-live="polite" className="text-xs font-semibold">
      {state === "saving" && (
        <span className="inline-flex items-center gap-1.5 text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Saving…</span>
      )}
      {state === "saved" && (
        <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400"><Check className="w-3.5 h-3.5" aria-hidden /> Saved</span>
      )}
      {state === "error" && (
        <span className="inline-flex items-center gap-1.5 text-red-700">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden />
          <span className="max-w-[140px] truncate" title={error}>{error || "Not saved"}</span>
          <button onClick={onRetry} className="underline min-h-[32px]">Retry</button>
        </span>
      )}
    </span>
  );
}

export function Group({
  id, title, summary, open, setOpen, children,
}: {
  id: string; title: string; summary: string; open: string | null; setOpen: (v: string | null) => void; children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <section className="border-b border-gray-100 dark:border-gray-800">
      <h3>
        <button
          aria-expanded={isOpen}
          aria-controls={`grp-${id}`}
          onClick={() => setOpen(isOpen ? null : id)}
          className="w-full flex items-center gap-3 px-5 min-h-[64px] text-left hover:bg-gray-50 dark:hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#A50F15]"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">{title}</span>
            <span className="block text-xs text-gray-600 dark:text-gray-400 truncate">{summary}</span>
          </span>
          <ChevronDown aria-hidden className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </h3>
      {isOpen && <div id={`grp-${id}`} className="px-5 pb-5">{children}</div>}
    </section>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="shrink-0 inline-flex items-center min-h-[44px] px-1 focus:outline-none group disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <span className={`relative w-11 h-6 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-[#A50F15] group-focus-visible:ring-offset-2 ${checked ? "bg-[#A50F15]" : "bg-gray-300 dark:bg-gray-700"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

export function Choice<T extends string>({
  name, value, options, onChange, disabled, columns = 1,
}: {
  name: string;
  value: T;
  options: { value: T; title: string; desc?: string; preview?: React.ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  columns?: 1 | 2 | 3 | 4;
}) {
  const cols = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" className={`grid ${cols} gap-2`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <label
            key={o.value}
            className={`relative flex ${o.preview ? "flex-col items-center text-center" : "items-start"} gap-2 min-h-[48px] p-3 rounded-[10px] border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#A50F15] ${
              active ? "border-[#A50F15] ring-1 ring-[#A50F15] bg-[#A50F15]/[0.03]" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input type="radio" name={name} value={o.value} checked={active} disabled={disabled}
              onChange={() => onChange(o.value)} className="sr-only" />
            {o.preview}
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">{o.title}</span>
              {o.desc && <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">{o.desc}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function Field({ label, htmlFor, children, hint, info }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string; info?: string }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="flex items-center gap-1 mb-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-gray-900 dark:text-white">{label}</label>
        {info && <InfoTip label={label} align="start">{info}</InfoTip>}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function EventsSection({
  widget, events, mode, disabled, onChange,
}: {
  widget: PortalWidget; events: PortalEventOption[]; mode: "all" | "category" | "picked"; disabled: boolean;
  onChange: (p: Partial<PortalWidget>) => void;
}) {
  const [localMode, setLocalMode] = useState(mode);
  const [query, setQuery] = useState("");
  useEffect(() => setLocalMode(mode), [mode]);

  const usedCategories = useMemo(() => {
    const set = new Set(events.filter((e) => e.isUpcoming && e.isPublic).map((e) => e.category));
    return CATEGORIES.filter((c) => set.has(c)).concat(CATEGORIES.filter((c) => !set.has(c)));
  }, [events]);

  const filtered = events
    .filter((e) => e.isPublic && (e.isUpcoming || widget.eventIds.includes(e.id)))
    .filter((e) => e.title.toLowerCase().includes(query.toLowerCase()));

  function toggle(list: string[], v: string) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  return (
    <div>
      <Field label="Event source" info="All upcoming events keeps the widget up to date on its own. Use categories or selected events to show a subset, for example on a hackathon landing page.">
        <Choice
          name="ev-mode"
          value={localMode}
          disabled={disabled}
          onChange={(v) => {
            setLocalMode(v);
            if (v === "all") onChange({ categories: [], eventIds: [] });
            if (v === "category") onChange({ eventIds: [] });
            if (v === "picked") onChange({ categories: [] });
          }}
          options={[
            { value: "all", title: "All upcoming events", desc: "New public events appear automatically." },
            { value: "category", title: "Specific categories", desc: "For example, only hackathons and meetups." },
            { value: "picked", title: "Selected events", desc: "Choose exactly which events appear." },
          ]}
        />
      </Field>

      {localMode === "category" && (
        <fieldset className="mt-4">
          <legend className="sr-only">Categories</legend>
          <div className="flex flex-wrap gap-2">
            {usedCategories.map((c) => {
              const on = widget.categories.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} disabled={disabled}
                  onClick={() => onChange({ categories: toggle(widget.categories, c) })}
                  className={`min-h-[40px] px-3.5 rounded-full border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15] ${
                    on ? "bg-[#A50F15] border-[#A50F15] text-white" : "border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}>
                  {label(c)}
                </button>
              );
            })}
          </div>
          {widget.categories.length === 0 && <p className="mt-2 text-xs text-amber-800">Select at least one category. Until then, all events are shown.</p>}
        </fieldset>
      )}

      {localMode === "picked" && (
        <div className="mt-4">
          <div className="relative">
            <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input aria-label="Search your events" className={`${input} pl-9`} placeholder="Search your events"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-[10px] border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-600">
                {events.length === 0 ? "No published events yet." : "No events match."}{" "}
                <Link href="/organizer/events/create" className="font-semibold text-[#A50F15] hover:underline">Create event</Link>
              </li>
            )}
            {filtered.map((e) => (
              <li key={e.id}>
                <label className="flex items-center gap-3 px-3 min-h-[52px] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
                  <input type="checkbox" disabled={disabled} checked={widget.eventIds.includes(e.id)}
                    onChange={() => onChange({ eventIds: toggle(widget.eventIds, e.id) })}
                    className="w-4 h-4 accent-[#A50F15]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{e.title}</span>
                    <span className="block text-xs text-gray-500">
                      {new Date(e.startAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {!e.isUpcoming && " · ended"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Field label={`Maximum events shown: ${widget.maxEvents}`} htmlFor="max-events"
        info="Extra events stay one click away under “View all”. Showing fewer keeps your page short."
        hint="Visitors can select “View all” to see the rest.">
        <input id="max-events" type="range" min={1} max={50} value={widget.maxEvents} disabled={disabled}
          onChange={(e) => onChange({ maxEvents: Number(e.target.value) })}
          className="w-full accent-[#A50F15] h-11" />
      </Field>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Show past events</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Shows your three most recent events below upcoming ones.</p>
        </div>
        <Switch checked={widget.showPast} disabled={disabled} label="Show past events" onChange={(v) => onChange({ showPast: v })} />
      </div>
    </div>
  );
}

export function LayoutIcon({ kind }: { kind: string }) {
  const bar = "bg-gray-300 dark:bg-gray-600 rounded-[2px]";
  return (
    <span aria-hidden className="w-14 h-10 rounded-[6px] border border-gray-200 dark:border-gray-700 p-1 flex">
      {kind === "grid" && <span className="grid grid-cols-2 gap-1 w-full"><span className={bar} /><span className={bar} /><span className={bar} /><span className={bar} /></span>}
      {kind === "list" && <span className="flex flex-col gap-1 w-full"><span className={`${bar} flex-1`} /><span className={`${bar} flex-1`} /></span>}
      {kind === "compact" && <span className="flex flex-col gap-[3px] w-full"><span className={`${bar} h-1.5`} /><span className={`${bar} h-1.5`} /><span className={`${bar} h-1.5`} /><span className={`${bar} h-1.5`} /></span>}
      {kind === "auto" && <span className="grid grid-cols-[2fr_1fr] gap-1 w-full"><span className={bar} /><span className="flex flex-col gap-1"><span className={`${bar} flex-1`} /><span className={`${bar} flex-1`} /></span></span>}
    </span>
  );
}

const TITLE_SUGGESTIONS = ["Upcoming events", "Join our next event", "Events & meetups", "Hackathons & workshops"];

type SectionProps = { widget: PortalWidget; disabled: boolean; onChange: (p: Partial<PortalWidget>) => void };
type LookProps = { widget: LookWidget; disabled: boolean; onChange: (p: Partial<LookWidget>) => void };

export function HeaderSection({
  widget, disabled, onChange, suggestions = TITLE_SUGGESTIONS, titlePlaceholder = "Upcoming events",
  descPlaceholder = "Hackathons, meetups and workshops for AI builders. Register in under a minute.", noun = "events",
}: LookProps & { suggestions?: string[]; titlePlaceholder?: string; descPlaceholder?: string; noun?: string }) {
  const title = widget.heading ?? "";
  const description = widget.subheading ?? "";
  return (
    <div>
      <Field label="Title" htmlFor="w-title" hint={`Appears above your ${noun}. Leave blank if your page already has a title.`}>
        <input id="w-title" className={input} value={title} maxLength={80} disabled={disabled}
          placeholder={titlePlaceholder} onChange={(e) => onChange({ heading: e.target.value })} />
        <Chips options={suggestions} value={title} disabled={disabled} onPick={(v) => onChange({ heading: v })} />
      </Field>

      <Field label="Description" htmlFor="w-description" info="One or two sentences under the title. Plain text only, and line breaks are kept.">
        <textarea id="w-description" className={`${input} min-h-[80px] py-2.5 resize-y`} value={description} maxLength={200} rows={3}
          disabled={disabled} placeholder={descPlaceholder}
          onChange={(e) => onChange({ subheading: e.target.value })} />
        <p className="mt-1 text-xs text-gray-500 text-right tabular-nums">{description.length}/200</p>
      </Field>

      <Field label="Alignment">
        <Choice name="h-align" columns={2} value={widget.headingAlign as "left"} disabled={disabled}
          onChange={(v) => onChange({ headingAlign: v })}
          options={[{ value: "left", title: "Left" }, { value: "center", title: "Center" }]} />
      </Field>

      <Field label="Title size">
        <Choice name="h-size" columns={3} value={widget.headingSize as "md"} disabled={disabled}
          onChange={(v) => onChange({ headingSize: v })}
          options={[{ value: "sm", title: "Small" }, { value: "md", title: "Medium" }, { value: "lg", title: "Large" }]} />
      </Field>
    </div>
  );
}

function LayoutSection({ widget, disabled, onChange }: SectionProps) {
  return (
    <div>
      <Field label="Layout" info="Grid suits wide pages. List suits sidebars and narrow columns. Compact fits many events in little space. Auto picks Grid or List from the available width.">
        <Choice name="layout" columns={4} value={widget.layout as "auto"} disabled={disabled}
          onChange={(v) => onChange({ layout: v })}
          options={(["auto", "grid", "list", "compact"] as const).map((k) => ({
            value: k,
            title: { auto: "Auto", grid: "Grid", list: "List", compact: "Compact" }[k],
            preview: <LayoutIcon kind={k} />,
          }))} />
        <p className="mt-1.5 text-xs text-gray-500">Auto shows a grid on wide pages and a list on narrow screens.</p>
      </Field>

      <Field label="Spacing" info="The gap between event cards.">
        <Choice name="spacing" columns={3} value={widget.spacing as "comfortable"} disabled={disabled}
          onChange={(v) => onChange({ spacing: v })}
          options={(Object.keys(OPT.spacing) as (keyof typeof OPT.spacing)[]).map((k) => ({ value: k, title: OPT.spacing[k] }))} />
      </Field>

      <Field label="Card style" info="Bordered adds a thin outline. Elevated adds a soft shadow. Flat uses a tinted background with no outline.">
        <Choice name="card-style" columns={3} value={widget.cardStyle as "bordered"} disabled={disabled}
          onChange={(v) => onChange({ cardStyle: v })}
          options={(Object.keys(OPT.cardStyle) as (keyof typeof OPT.cardStyle)[]).map((k) => ({
            value: k, title: OPT.cardStyle[k], preview: <CardStyleIcon kind={k} />,
          }))} />
      </Field>

      <Field label="Card details" info="Choose what appears on each card. Spots remaining and attendee count only appear when they help, so visitors never see “0 going”.">
        <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-800">
          {([
            ["showCover", "Cover image", ""],
            ["showCategory", "Category", ""],
            ["showPrice", "Price", ""],
            ["showSpotsLeft", "Spots remaining", "Shown when few spots are left"],
            ["showAttendeeCount", "Attendee count", "Shown from 5 registrations"],
          ] as const).map(([k, l, d]) => (
            <div key={k} className="flex items-center justify-between gap-3 pl-3 pr-2">
              <span className="py-2">
                <span className="block text-sm text-gray-800 dark:text-gray-200">{l}</span>
                {d && <span className="block text-xs text-gray-500">{d}</span>}
              </span>
              <Switch checked={widget[k]} disabled={disabled} label={l} onChange={(v) => onChange({ [k]: v } as Partial<PortalWidget>)} />
            </div>
          ))}
        </div>
      </Field>
    </div>
  );
}

export function AppearanceSection({ widget, disabled, onChange }: LookProps) {
  const [hex, setHex] = useState(widget.accentColor.toUpperCase());
  const [hexError, setHexError] = useState("");
  useEffect(() => setHex(widget.accentColor.toUpperCase()), [widget.accentColor]);

  function commitHex(v: string) {
    const val = v.startsWith("#") ? v : `#${v}`;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setHexError("");
      onChange({ accentColor: val.toLowerCase() });
    } else {
      setHexError("Enter a 6-digit hex code, such as #A50F15.");
    }
  }

  return (
    <div>
      <Field label="Theme">
        <Choice name="theme" columns={3} value={widget.darkMode as "auto"} disabled={disabled}
          onChange={(v) => onChange({ darkMode: v })}
          options={(Object.keys(OPT.theme) as (keyof typeof OPT.theme)[]).map((k) => ({ value: k, title: OPT.theme[k] }))} />
        <p className="mt-1.5 text-xs text-gray-500">Auto matches your page background, or the visitor's system setting.</p>
      </Field>

      <Field label="Accent color" info="Used for buttons, active filters and highlights. Match it to your brand color.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Preset colors">
          {SWATCHES.map((c) => {
            const on = widget.accentColor.toLowerCase() === c.toLowerCase();
            return (
              <button key={c} role="radio" aria-checked={on} aria-label={c} disabled={disabled}
                onClick={() => onChange({ accentColor: c.toLowerCase() })}
                className={`w-11 h-11 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#A50F15] ${on ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-white" : ""}`}
                style={{ background: c }}>
                {on && <Check className="w-4 h-4 text-white" aria-hidden />}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="color" aria-label="Custom color" disabled={disabled} value={widget.accentColor}
            onChange={(e) => onChange({ accentColor: e.target.value })}
            className="w-11 h-11 rounded-[10px] border border-gray-300 dark:border-gray-700 cursor-pointer p-1 bg-white dark:bg-gray-950" />
          <input aria-label="Hex code" className={`${input} font-mono uppercase w-36`} value={hex} disabled={disabled} maxLength={7}
            aria-invalid={!!hexError} onChange={(e) => setHex(e.target.value)} onBlur={(e) => commitHex(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitHex((e.target as HTMLInputElement).value)} />
        </div>
        {hexError && <p className="mt-1 text-[13px] text-red-700">{hexError}</p>}
        <p className="mt-1.5 text-xs text-gray-500">Button text switches between black and white to stay readable.</p>
      </Field>

      <Field label="Corner radius" info="Rounds the corners of cards, fields and buttons. Match the style of your website.">
        <Choice name="corners" columns={3} value={widget.cornerStyle as "rounded"} disabled={disabled}
          onChange={(v) => onChange({ cornerStyle: v })}
          options={[{ value: "sharp", title: "Square" }, { value: "rounded", title: "Rounded" }, { value: "pill", title: "Pill" }]} />
      </Field>

      <Field label="Font" hint="Applies to the whole widget. Choose the one closest to your website's font.">
        <div role="radiogroup" aria-label="Font" className="grid grid-cols-2 gap-2">
          {EMBED_FONTS.map((f) => {
            const on = (widget.fontFamily || "system") === f.id;
            return (
              <button key={f.id} type="button" role="radio" aria-checked={on} disabled={disabled}
                onClick={() => onChange({ fontFamily: f.id })}
                className={`min-h-[44px] px-3 rounded-[10px] border text-sm text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15] ${
                  on ? "border-[#A50F15] ring-1 ring-[#A50F15] bg-[#A50F15]/[0.03] font-semibold text-gray-900 dark:text-white" : "border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                }`}>
                {f.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Text size" info="Scales all text in the widget, including the registration form.">
        <Choice name="t-scale" columns={3} value={widget.textScale as "md"} disabled={disabled}
          onChange={(v) => onChange({ textScale: v })}
          options={[{ value: "sm", title: "Small" }, { value: "md", title: "Default" }, { value: "lg", title: "Large" }]} />
      </Field>
    </div>
  );
}

export function ButtonSection({
  widget, disabled, onChange, labels = BUTTON_LABELS, defaultLabel = "Register",
  hint = "Events that need approval show “Request to join” when the label is “Register”.",
}: LookProps & { labels?: string[]; defaultLabel?: string; hint?: string }) {
  const [label, setLabel] = useState(widget.buttonText);
  useEffect(() => setLabel(widget.buttonText), [widget.buttonText]);
  const accent = widget.accentColor;
  return (
    <div>
      <Field label="Button label" htmlFor="btn-label" hint={hint}>
        <input id="btn-label" className={input} value={label} maxLength={24} disabled={disabled} placeholder={defaultLabel}
          onChange={(e) => { setLabel(e.target.value); if (e.target.value.trim()) onChange({ buttonText: e.target.value }); }}
          onBlur={() => { if (!label.trim()) { setLabel(defaultLabel); onChange({ buttonText: defaultLabel }); } }} />
        <Chips options={labels} value={widget.buttonText} disabled={disabled} onPick={(v) => onChange({ buttonText: v })} />
      </Field>

      <Field label="Button size" info="Medium (44px) meets mobile touch-target guidelines. Small suits dense lists. Large suits single-event pages.">
        <Choice name="btn-size" columns={3} value={widget.buttonSize as "md"} disabled={disabled}
          onChange={(v) => onChange({ buttonSize: v })}
          options={(Object.keys(OPT.buttonSize) as (keyof typeof OPT.buttonSize)[]).map((k) => ({
            value: k, title: OPT.buttonSize[k],
            preview: <span aria-hidden className="block rounded-[6px]" style={{ background: accent, width: { sm: 34, md: 44, lg: 54 }[k], height: { sm: 12, md: 16, lg: 20 }[k] }} />,
          }))} />
      </Field>

      <Field label="Button style" info="Filled stands out most. Outline and Soft are subtler and suit pages with many buttons.">
        <Choice name="btn-style" columns={3} value={widget.buttonStyle as "filled"} disabled={disabled}
          onChange={(v) => onChange({ buttonStyle: v })}
          options={(Object.keys(OPT.buttonStyle) as (keyof typeof OPT.buttonStyle)[]).map((k) => ({
            value: k, title: OPT.buttonStyle[k],
            preview: (
              <span aria-hidden className="block w-12 h-5 rounded-[6px]" style={
                k === "filled" ? { background: accent }
                  : k === "outline" ? { boxShadow: `inset 0 0 0 1.5px ${accent}` }
                    : { background: `color-mix(in srgb, ${accent} 18%, white)` }
              } />
            ),
          }))} />
      </Field>
    </div>
  );
}

export function Chips({ options, value, disabled, onPick }: { options: string[]; value: string; disabled: boolean; onPick: (v: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" disabled={disabled} onClick={() => onPick(o)} aria-pressed={value === o}
          className={`min-h-[36px] px-3 rounded-full border text-xs font-medium ${value === o ? "border-[#A50F15] text-[#A50F15]" : "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function CardStyleIcon({ kind }: { kind: "bordered" | "elevated" | "flat" }) {
  const cls = kind === "bordered" ? "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
    : kind === "elevated" ? "bg-white dark:bg-gray-800 shadow-md"
      : "bg-gray-100 dark:bg-gray-800";
  return <span aria-hidden className={`block w-12 h-8 rounded-[6px] ${cls}`} />;
}

export function DomainsSection({ domains, disabled, onChange, noun = "events" }: { domains: string[]; disabled: boolean; onChange: (d: string[]) => void; noun?: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function add() {
    const raw = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    if (!raw) return;
    if (!DOMAIN_RE.test(raw)) {
      setError(`“${value.trim()}” isn't a valid domain. Use a format like example.com or *.example.com.`);
      return;
    }
    if (domains.includes(raw)) {
      setError(`${raw} is already on the list.`);
      return;
    }
    setError("");
    setValue("");
    onChange([...domains, raw]);
  }

  return (
    <div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Leave blank to allow all domains. Add domains to stop other websites from showing your {noun}.
        Localhost always works for testing.
      </p>
      {domains.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {domains.map((d) => (
            <li key={d} className="inline-flex items-center gap-1 pl-3 pr-1 min-h-[36px] rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
              {d}
              <button disabled={disabled} onClick={() => onChange(domains.filter((x) => x !== d))}
                aria-label={`Remove ${d}`} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <input aria-label="Add domain" className={input} placeholder="example.com" value={value} disabled={disabled}
          aria-invalid={!!error} aria-describedby={error ? "domain-err" : undefined}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} />
        <button onClick={add} disabled={disabled || !value.trim()} className={btnSecondary}>Add</button>
      </div>
      {error && <p id="domain-err" className="mt-1.5 text-[13px] text-red-700">{error}</p>}
      <p className="mt-2 text-xs text-gray-500">Use *.example.com to include all subdomains.</p>
    </div>
  );
}

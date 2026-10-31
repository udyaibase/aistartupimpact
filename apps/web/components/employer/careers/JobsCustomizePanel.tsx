"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { JobsPortalWidget } from "@/lib/jobs/careers";
import { getEmbedFont } from "@/lib/embed/fonts";
import { btnGhost } from "@/components/organizer/embed/ui";
import {
  AppearanceSection, ButtonSection, CardStyleIcon, Choice, DomainsSection, Field, Group, HeaderSection, LayoutIcon, OPT,
  SaveIndicator, Switch, type SaveState,
} from "@/components/organizer/embed/CustomizePanel";

interface Props {
  widget: JobsPortalWidget;
  departments: string[];
  saveState: SaveState;
  saveError: string;
  onChange: (patch: Partial<JobsPortalWidget>) => void;
  onRetry: () => void;
  onClose: () => void;
}

const TITLE_SUGGESTIONS = ["Open roles", "Join our team", "We're hiring", "Careers"];
const BUTTON_LABELS = ["View role", "Apply now", "See details", "View job", "Learn more", "Apply"];

/** Customize drawer for the careers widget; same sections and controls as the events widget. */
export default function JobsCustomizePanel({ widget, departments, saveState, saveError, onChange, onRetry, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Parent re-renders on every keystroke (autosave), so keep these effects mount-only.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const layoutLabel = { auto: "Auto", grid: "Grid", list: "List", compact: "Compact" }[widget.layout as "auto"] ?? widget.layout;
  const jobsSummary = widget.departments.length ? widget.departments.join(", ") : "All open jobs";
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/30 lg:bg-black/10" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-labelledby="customize-title"
        className="fixed inset-y-0 right-0 z-modal w-full sm:w-[440px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 flex flex-col font-jakarta shadow-xl">
        <header className="flex items-center gap-3 px-4 sm:px-5 min-h-[4rem] shrink-0 border-b border-gray-100 dark:border-gray-800" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <h2 id="customize-title" className="portal-section-title flex-1">Customize</h2>
          <SaveIndicator state={saveState} error={saveError} onRetry={onRetry} />
          <button ref={closeRef} onClick={onClose} className={btnGhost} aria-label="Close customize panel">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Group id="header" title="Header" summary={widget.heading ? `“${widget.heading}”` : "No title"} open={open} setOpen={setOpen}>
            <HeaderSection widget={widget} disabled={false} onChange={onChange} noun="jobs"
              suggestions={TITLE_SUGGESTIONS} titlePlaceholder="Open roles"
              descPlaceholder="We're a small team building AI for India. Join us." />
          </Group>

          <Group id="jobs" title="Jobs" summary={`${jobsSummary} · up to ${widget.maxJobs}`} open={open} setOpen={setOpen}>
            <Field label="Teams" info="Show every open job, or only some teams, for example only Engineering on your engineering blog.">
              {departments.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  All your open jobs are shown. Add a Team to your jobs to filter by team. <Link href="/employer/jobs" className="font-semibold text-[#A50F15] hover:underline">Go to jobs</Link>
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {departments.map((d) => {
                      const on = widget.departments.includes(d);
                      return (
                        <button key={d} type="button" aria-pressed={on} onClick={() => onChange({ departments: toggle(widget.departments, d) })}
                          className={`min-h-[40px] px-3.5 rounded-full border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15] ${
                            on ? "bg-[#A50F15] border-[#A50F15] text-white" : "border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                          }`}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{widget.departments.length ? "Only these teams are shown." : "None selected: every team is shown."}</p>
                </>
              )}
            </Field>
            <Field label={`Maximum jobs shown: ${widget.maxJobs}`} htmlFor="max-jobs" info="Extra jobs stay one click away under “View all”."
              hint="Visitors can select “View all” to see the rest.">
              <input id="max-jobs" type="range" min={1} max={50} value={widget.maxJobs}
                onChange={(e) => onChange({ maxJobs: Number(e.target.value) })} className="w-full accent-[#A50F15] h-11" />
            </Field>
            <p className="mt-2 text-xs text-gray-500">Only open jobs with “Your website (careers widget)” ticked appear here.</p>
          </Group>

          <Group id="layout" title="Layout"
            summary={`${layoutLabel} · ${OPT.spacing[widget.spacing as keyof typeof OPT.spacing] ?? "Comfortable"} spacing · ${OPT.cardStyle[widget.cardStyle as keyof typeof OPT.cardStyle] ?? "Bordered"} cards`}
            open={open} setOpen={setOpen}>
            <Field label="Layout" info="Grid suits wide pages. List suits sidebars and narrow columns. Compact fits many jobs in little space. Auto picks Grid or List from the available width.">
              <Choice name="layout" columns={4} value={widget.layout as "auto"} onChange={(v) => onChange({ layout: v })}
                options={(["auto", "grid", "list", "compact"] as const).map((k) => ({
                  value: k, title: { auto: "Auto", grid: "Grid", list: "List", compact: "Compact" }[k], preview: <LayoutIcon kind={k} />,
                }))} />
              <p className="mt-1.5 text-xs text-gray-500">Auto shows a grid on wide pages and a list on narrow screens.</p>
            </Field>
            <Field label="Spacing" info="The gap between job cards.">
              <Choice name="spacing" columns={3} value={widget.spacing as "comfortable"} onChange={(v) => onChange({ spacing: v })}
                options={(Object.keys(OPT.spacing) as (keyof typeof OPT.spacing)[]).map((k) => ({ value: k, title: OPT.spacing[k] }))} />
            </Field>
            <Field label="Card style" info="Bordered adds a thin outline. Elevated adds a soft shadow. Flat uses a tinted background with no outline.">
              <Choice name="card-style" columns={3} value={widget.cardStyle as "bordered"} onChange={(v) => onChange({ cardStyle: v })}
                options={(Object.keys(OPT.cardStyle) as (keyof typeof OPT.cardStyle)[]).map((k) => ({ value: k, title: OPT.cardStyle[k], preview: <CardStyleIcon kind={k} /> }))} />
            </Field>
            <Field label="Card details" info="Choose what appears on each job card. Salary only shows for jobs where you chose to show it.">
              <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-800">
                {([
                  ["showLogo", "Company logo", ""],
                  ["showDepartment", "Team", ""],
                  ["showSalary", "Salary", "Only for jobs that show salary"],
                  ["showSkills", "Skills", "Up to three per job"],
                ] as const).map(([k, l, d]) => (
                  <div key={k} className="flex items-center justify-between gap-3 pl-3 pr-2">
                    <span className="py-2">
                      <span className="block text-sm text-gray-800 dark:text-gray-200">{l}</span>
                      {d && <span className="block text-xs text-gray-500">{d}</span>}
                    </span>
                    <Switch checked={widget[k]} label={l} onChange={(v) => onChange({ [k]: v } as Partial<JobsPortalWidget>)} />
                  </div>
                ))}
              </div>
            </Field>
          </Group>

          <Group id="appearance" title="Appearance"
            summary={`${OPT.theme[widget.darkMode as keyof typeof OPT.theme] ?? "Auto"} theme · ${widget.accentColor.toUpperCase()} · ${getEmbedFont(widget.fontFamily).label}`}
            open={open} setOpen={setOpen}>
            <AppearanceSection widget={widget} disabled={false} onChange={onChange} />
          </Group>

          <Group id="button" title="Button"
            summary={`“${widget.buttonText}” · ${OPT.buttonSize[widget.buttonSize as keyof typeof OPT.buttonSize] ?? "Medium"} · ${OPT.buttonStyle[widget.buttonStyle as keyof typeof OPT.buttonStyle] ?? "Filled"}`}
            open={open} setOpen={setOpen}>
            <ButtonSection widget={widget} disabled={false} onChange={onChange} labels={BUTTON_LABELS} defaultLabel="View role"
              hint="Opens the full job inside the widget, where candidates apply without leaving your site." />
          </Group>

          <Group id="sites" title="Allowed domains" summary={widget.allowedDomains.length ? widget.allowedDomains.join(", ") : "All domains"} open={open} setOpen={setOpen}>
            <DomainsSection domains={widget.allowedDomains} disabled={false} noun="jobs" onChange={(d) => onChange({ allowedDomains: d })} />
          </Group>

          <Group id="branding" title="Branding" summary="Powered by Udyaibase" open={open} setOpen={setOpen}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Show “Powered by Udyaibase”</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Always shown on the free plan.</p>
              </div>
              <Switch checked disabled label="Show Powered by Udyaibase" onChange={() => {}} />
            </div>
            <Link href="/employer/support?topic=branding" className="inline-block mt-3 text-sm font-semibold text-[#A50F15] hover:underline">
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

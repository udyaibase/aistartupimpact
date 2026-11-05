"use client";

import { useState } from "react";
import type { JobsPortalWidget } from "@/lib/jobs/careers";
import { Field, Switch } from "@/components/organizer/embed/CustomizePanel";
import { contrastRatio, DESIGN_PRESETS, isFontName, type DesignColorKey, type WidgetDesign } from "@/lib/jobs/widget-design";
import { APPLY_FIELDS, DEFAULT_SUBMIT_LABEL, type ApplyFormConfig, type FieldMode } from "@/lib/jobs/apply-form";

type OnChange = (patch: Partial<JobsPortalWidget>) => void;
const textInput = "w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15]";

/** Automatic matching on the employer's real page, plus one-click starting points for the shape. */
export function MatchWebsiteSection({ widget, onChange }: { widget: JobsPortalWidget; onChange: OnChange }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 rounded-[10px] border border-gray-200 dark:border-gray-800 p-3">
        <span>
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">Match automatically on my website</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Copies your page’s colours, corners and font when the widget loads there. Anything you set under Appearance still wins.
            Check the result on your live page, since this preview isn’t on your site. Fonts not on Google Fonts use a similar system font.
          </span>
        </span>
        <Switch checked={!!widget.design.matchSite} label="Match automatically on my website" onChange={(matchSite) => onChange({ design: { ...widget.design, matchSite } })} />
      </div>
      <Field label="Start from a style" info="Sets the shape and spacing. Your colours and font stay as they are.">
        <div className="grid grid-cols-2 gap-2">
          {DESIGN_PRESETS.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onChange({ ...p.patch, design: { ...widget.design, ...p.patch.design } } as Partial<JobsPortalWidget>)}
              className="min-h-[56px] px-3 py-2 rounded-[10px] border border-gray-200 dark:border-gray-700 text-left hover:bg-gray-50 dark:hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15]">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">{p.name}</span>
              <span className="block text-xs text-gray-500">{p.hint}</span>
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

const COLOR_FIELDS: { key: DesignColorKey; label: string; hint: string; fallback: string }[] = [
  { key: "card", label: "Cards and fields", hint: "Job cards and the application form", fallback: "#ffffff" },
  { key: "text", label: "Text", hint: "Also used for the heading, which sits on your page", fallback: "#18181b" },
  { key: "muted", label: "Secondary text", hint: "Locations and hints", fallback: "#52525b" },
  { key: "border", label: "Lines", hint: "Card and field outlines", fallback: "#e4e4e7" },
  { key: "background", label: "Widget background", hint: "Leave unset to show your page behind it", fallback: "#f4f4f5" },
];

/** Exact colours, any Google font, exact corners and width: what it takes to sit naturally on a company's site. */
export function OwnLookSection({ widget, onChange }: { widget: JobsPortalWidget; onChange: OnChange }) {
  const design = widget.design;
  const set = (patch: WidgetDesign) => onChange({ design: { ...design, ...patch } });
  const setColor = (key: DesignColorKey, value: string | null) => {
    const colors = { ...design.colors };
    if (value) colors[key] = value; else delete colors[key];
    // Own colours are one fixed look, so they shouldn't change with the visitor's light or dark setting.
    onChange({ design: { ...design, colors }, ...(widget.darkMode === "auto" && value ? { darkMode: "light" } : {}) });
  };
  const c = design.colors ?? {};
  const textOnCard = contrastRatio(c.text ?? "#18181b", c.card ?? "#ffffff");
  const lowContrast = (c.text || c.card) && textOnCard < 4.5;

  return (
    <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">Match your brand exactly</p>
      <p className="text-xs text-gray-500 mt-0.5">These replace the choices above. Use the values from your website’s design.</p>

      <Field label="Colours">
        <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-800">
          {COLOR_FIELDS.map((f) => {
            const value = c[f.key];
            return (
              <div key={f.key} className="flex items-center gap-3 px-3 py-2">
                <input type="color" aria-label={`${f.label} colour`} value={value ?? f.fallback} onChange={(e) => setColor(f.key, e.target.value)}
                  className="w-10 h-10 shrink-0 rounded-[8px] border border-gray-300 dark:border-gray-700 cursor-pointer p-0.5 bg-white dark:bg-gray-950" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-800 dark:text-gray-200">{f.label}</span>
                  <span className="block text-xs text-gray-500">{value ? value.toUpperCase() : f.hint}</span>
                </span>
                {value && (
                  <button type="button" onClick={() => setColor(f.key, null)} className="min-h-[40px] px-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:underline" aria-label={`Reset ${f.label}`}>Reset</button>
                )}
              </div>
            );
          })}
        </div>
        {lowContrast && (
          <p role="alert" className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            Text and card colours are too close ({textOnCard.toFixed(1)}:1). Candidates may struggle to read this. Aim for at least 4.5:1.
          </p>
        )}
      </Field>

      <FontField label="Font, from Google Fonts" id="own-font" value={design.font} placeholder="e.g. Manrope"
        hint="Type the exact name from fonts.google.com. Leave empty to use the font chosen above." onCommit={(font) => set({ font })} />
      <FontField label="Heading font (optional)" id="own-heading-font" value={design.headingFont} placeholder="e.g. Fraunces"
        hint="Leave empty to use the same font for headings." onCommit={(headingFont) => set({ headingFont })} />

      <Field label={design.radius === undefined ? "Exact corners: using the choice above" : `Exact corners: ${design.radius}px`} htmlFor="own-radius">
        <input id="own-radius" type="range" min={0} max={32} value={design.radius ?? 12} onChange={(e) => set({ radius: Number(e.target.value) })} className="w-full accent-[#A50F15] h-11" />
        {design.radius !== undefined && (
          <button type="button" onClick={() => set({ radius: undefined })} className="text-xs font-semibold text-gray-600 dark:text-gray-400 hover:underline">Use the choice above</button>
        )}
      </Field>

      <Field label={design.maxWidth ? `Maximum width: ${design.maxWidth}px` : "Maximum width: full width"} htmlFor="own-width" info="Keeps the widget lined up with your page content on wide screens.">
        <input id="own-width" type="range" min={480} max={1600} step={20} value={design.maxWidth ?? 1600}
          onChange={(e) => { const v = Number(e.target.value); set({ maxWidth: v >= 1600 ? undefined : v }); }} className="w-full accent-[#A50F15] h-11" />
      </Field>
    </div>
  );
}

function FontField({ label, id, value, placeholder, hint, onCommit }: {
  label: string; id: string; value: string | undefined; placeholder: string; hint: string; onCommit: (v: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState("");
  // Saved on leaving the field, so the preview doesn't request a font for every keystroke.
  const commit = () => {
    const v = text.trim();
    if (v && !isFontName(v)) { setError("Use the font’s name only, with letters, numbers and spaces."); return; }
    setError("");
    if (v !== (value ?? "")) onCommit(v || undefined);
  };
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} value={text} placeholder={placeholder} maxLength={49} className={textInput} aria-invalid={!!error || undefined}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      <p className={`mt-1.5 text-xs ${error ? "text-red-700 dark:text-red-400" : "text-gray-500"}`}>{error || hint}</p>
    </Field>
  );
}

export function FiltersSection({ widget, onChange }: { widget: JobsPortalWidget; onChange: OnChange }) {
  const design = widget.design;
  const rows = [
    { key: "showSearch", label: "Search box", on: !!design.showSearch },
    { key: "showLocationFilter", label: "Location filter", on: !!design.showLocationFilter },
    { key: "showTeamFilter", label: "Team filter", on: design.showTeamFilter !== false },
  ] as const;
  return (
    <Field label="Filters for visitors" info="Location and team filters appear only when your jobs have more than one to choose from.">
      <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-800">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 pl-3 pr-2">
            <span className="py-2 text-sm text-gray-800 dark:text-gray-200">{r.label}</span>
            <Switch checked={r.on} label={r.label} onChange={(v) => onChange({ design: { ...design, [r.key]: v } })} />
          </div>
        ))}
      </div>
    </Field>
  );
}

const MODES: { value: FieldMode; label: string }[] = [
  { value: "optional", label: "Optional" }, { value: "required", label: "Required" }, { value: "hidden", label: "Off" },
];

/** Applies wherever candidates apply: this widget and the Udyaibase job page. */
export function ApplyFormSection({ form, onChange }: { form: ApplyFormConfig; onChange: (f: ApplyFormConfig) => void }) {
  const set = (patch: Partial<ApplyFormConfig>) => onChange({ ...form, ...patch });
  return (
    <div>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Used wherever candidates apply to you. To check it, choose an Apply view above the preview. Every question you add can lose applicants, so ask only what you’ll use.
      </p>
      <Field label="Fields" info="Name, email, resume and consent are always required. Turning a field off means it’s never collected.">
        <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-800">
          {APPLY_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-sm text-gray-800 dark:text-gray-200">{f.label}</span>
              <select value={form.fields[f.key]} onChange={(e) => set({ fields: { ...form.fields, [f.key]: e.target.value as FieldMode } })}
                aria-label={`${f.label}: optional, required or off`}
                className="min-h-[40px] px-2 rounded-[8px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white">
                {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Skills question" info="Candidates tick which of the job’s skills they have. Turning it off also turns off the skills match on each candidate.">
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-gray-200 dark:border-gray-800 pl-3 pr-2">
          <span className="py-2 text-sm text-gray-800 dark:text-gray-200">Ask which skills they have</span>
          <Switch checked={form.askSkills} label="Ask which skills they have" onChange={(askSkills) => set({ askSkills })} />
        </div>
      </Field>
      <Field label="Intro text (optional)" htmlFor="form-intro" hint="Appears above the form.">
        <textarea id="form-intro" rows={2} maxLength={300} value={form.intro} onChange={(e) => set({ intro: e.target.value })}
          placeholder="We read every application and reply within a week." className={`${textInput} py-2.5`} />
      </Field>
      <Field label="Submit button" htmlFor="form-submit">
        <input id="form-submit" maxLength={30} value={form.submitLabel === DEFAULT_SUBMIT_LABEL ? "" : form.submitLabel} placeholder={DEFAULT_SUBMIT_LABEL}
          onChange={(e) => set({ submitLabel: e.target.value || DEFAULT_SUBMIT_LABEL })} className={textInput} />
      </Field>
      <Field label="Thank-you message (optional)" htmlFor="form-thanks" hint="We always add a note that a tracking link was emailed.">
        <textarea id="form-thanks" rows={2} maxLength={300} value={form.successMessage} onChange={(e) => set({ successMessage: e.target.value })}
          placeholder="Thanks for applying. We’ll be in touch soon." className={`${textInput} py-2.5`} />
      </Field>
      <p className="mt-4 text-xs text-gray-500">Job-specific questions, including multiple choice, are set on each job when you post it.</p>
    </div>
  );
}

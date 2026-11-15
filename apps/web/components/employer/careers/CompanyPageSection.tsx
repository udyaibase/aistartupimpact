"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { CareersSettings } from "@/lib/jobs/careers";
import {
  blankSection, LIMITS, orderFor, SECTION_INFO, SECTION_TYPES, type CareersSection, type NameText, type Quote, type SectionType,
} from "@/lib/jobs/careers-content";
import { PERK_OPTIONS, MAX_PERKS, MAX_PERK_LENGTH } from "@/lib/jobs/perks";
import { input as inputCls, btnGhost, btnSecondary } from "@/components/organizer/embed/ui";
import { Field, Switch } from "@/components/organizer/embed/CustomizePanel";

/** Example wording, shown only as placeholders (never saved). */
const EXAMPLES = {
  headline: "We build AI that helps Indian farmers grow more with less",
  description: "Founded in 2023 in Bengaluru, we're a team of 25 engineers and agronomists…",
  missionStatement: "Make expert crop advice available to every farmer in their own language.",
  missionBody: "Why it matters, and what success looks like in five years.",
  value: ["Ship weekly", "Own the outcome", "Learn in public", "Be kind, be direct"],
  valueText: "One line on what this looks like day to day.",
  step: ["Intro call", "Take-home task", "Team interviews", "Offer"],
  stepText: "Who it's with, how long it takes.",
  quote: "What do you enjoy most about working here?",
};

const ta = `${inputCls} min-h-[88px] py-2 resize-y`;

function summaryOf(s: CareersSection, settings: CareersSettings): string {
  switch (s.type) {
    case "intro": return settings.headline || (settings.description ? "Description only" : "Empty: add a headline");
    case "perks": return settings.perks.length ? `${settings.perks.length} perks` : "No perks yet";
    case "mission": return s.statement || "Empty";
    case "values": return `${s.items.filter((i) => i.name).length} values`;
    case "process": return `${s.items.filter((i) => i.name).length} steps`;
    case "voices": return `${s.quotes.filter((q) => q.quote && q.name).length} quotes`;
    case "text": return s.title || (s.body ? s.body.slice(0, 40) : "Empty");
  }
}

/** Careers page sections: fixed types in the template's order, each switched on or off and edited as plain text. */
export default function CompanyPageSection({ careers, companyName, onChange, focus }: {
  careers: CareersSettings;
  companyName: string;
  onChange: (careers: CareersSettings) => void;
  /** Open this section type for editing (adding it first if missing); `n` changes on every request. */
  focus?: { type: SectionType; n: number } | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const sections = careers.content.sections;

  const setContent = (patch: Partial<CareersSettings["content"]>) => onChange({ ...careers, content: { ...careers.content, ...patch } });
  const setSections = (next: CareersSection[]) => setContent({ sections: next });
  const updateSection = (id: string, patch: Partial<CareersSection>) =>
    setSections(sections.map((s) => (s.id === id ? ({ ...s, ...patch } as CareersSection) : s)));
  const count = (t: SectionType) => sections.filter((s) => s.type === t).length;
  const add = (t: SectionType) => {
    const s = blankSection(t);
    setSections(orderFor(careers.content.template, [...sections, s]));
    setAdding(false);
    setEditing(s.id);
  };

  // "Next steps" in the editor: jump straight to a section, adding it if needed.
  useEffect(() => {
    if (!focus) return;
    const found = sections.find((s) => s.type === focus.type);
    if (found) {
      if (!found.enabled) updateSection(found.id, { enabled: true });
      setEditing(found.id);
    } else add(focus.type);
    requestAnimationFrame(() => document.getElementById("sections-list")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  return (
    <div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3 pl-3 pr-2">
          <span className="py-2">
            <span className="block text-sm text-gray-800 dark:text-gray-200">Accept general applications</span>
            <span className="block text-xs text-gray-500">When no roles are open, your careers page and website widget let candidates send a resume. They arrive under “General application” in Applications.</span>
          </span>
          <Switch checked={careers.acceptGeneral} label="Accept general applications when no roles are open" onChange={(v) => onChange({ ...careers, acceptGeneral: v })} />
        </div>
      </div>

      <h4 id="sections-list" className="mt-6 mb-2 text-sm font-semibold text-gray-900 dark:text-white scroll-mt-24">Sections</h4>
      {sections.length === 0 && <p className="text-sm text-gray-500 mb-2">No sections yet. Add one below.</p>}
      <ol className="flex flex-col gap-2">
        {sections.map((s) => {
          const info = SECTION_INFO[s.type];
          const isOpen = editing === s.id;
          return (
            <li key={s.id} className="rounded-[10px] border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-1 pl-3 pr-1">
                <button type="button" onClick={() => setEditing(isOpen ? null : s.id)} aria-expanded={isOpen}
                  className="flex-1 min-w-0 text-left py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15] rounded">
                  <span className={`block text-sm font-medium ${s.enabled ? "text-gray-900 dark:text-white" : "text-gray-500"}`}>
                    {info.label}{!s.enabled && " (hidden)"}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">{summaryOf(s, careers)}</span>
                </button>
                <Switch checked={s.enabled} label={`Show ${info.label}`} onChange={(v) => updateSection(s.id, { enabled: v })} />
                <button type="button" onClick={() => setEditing(isOpen ? null : s.id)} aria-label={`${isOpen ? "Close" : "Edit"} ${info.label}`} className={btnGhost}>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {isOpen && (
                <div className="px-3 pb-4 pt-1 border-t border-gray-100 dark:border-gray-800">
                  <SectionEditor section={s} careers={careers} onChange={onChange} update={(p) => updateSection(s.id, p)} />
                  <button type="button" onClick={() => { setSections(sections.filter((x) => x.id !== s.id)); setEditing(null); }}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400 hover:underline">
                    <Trash2 className="w-4 h-4" aria-hidden /> Remove section
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {sections.length < LIMITS.sections && (
        <div className="mt-3">
          <button type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding} className={btnSecondary}>
            <Plus className="w-4 h-4" aria-hidden /> Add section
          </button>
          {adding && (
            <ul className="mt-2 flex flex-col gap-1 rounded-[10px] border border-gray-200 dark:border-gray-800 p-1">
              {SECTION_TYPES.map((t) => {
                const full = count(t) >= SECTION_INFO[t].max;
                return (
                  <li key={t}>
                    <button type="button" disabled={full} onClick={() => add(t)}
                      className="w-full text-left px-3 py-2 rounded-[8px] hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:hover:bg-transparent">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">{SECTION_INFO[t].label}{full && " (added)"}</span>
                      <span className="block text-xs text-gray-500">{SECTION_INFO[t].blurb}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-gray-500">The template sets the order. Plain text only; photos and video are coming later.</p>
    </div>
  );
}

function TitleField({ value, placeholder, onChange, id }: { value: string; placeholder: string; onChange: (v: string) => void; id: string }) {
  return (
    <Field label="Section title" htmlFor={id} hint={`Leave empty to use “${placeholder}”.`}>
      <input id={id} className={inputCls} value={value} maxLength={LIMITS.title} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function SectionEditor({ section: s, careers, onChange, update }: {
  section: CareersSection;
  careers: CareersSettings;
  onChange: (c: CareersSettings) => void;
  update: (patch: Partial<CareersSection>) => void;
}) {
  const id = `sec-${s.id}`;
  switch (s.type) {
    case "intro":
      return (
        <>
          <Field label="Headline" htmlFor={`${id}-h`} hint="One line that sums up what the company does.">
            <input id={`${id}-h`} className={inputCls} value={careers.headline} maxLength={LIMITS.headline} placeholder={EXAMPLES.headline}
              onChange={(e) => onChange({ ...careers, headline: e.target.value })} />
          </Field>
          <Field label="About the company" htmlFor={`${id}-d`} hint="This is your company description, also shown on your jobs.">
            <textarea id={`${id}-d`} className={ta} value={careers.description} maxLength={LIMITS.description} placeholder={EXAMPLES.description}
              onChange={(e) => onChange({ ...careers, description: e.target.value })} />
          </Field>
        </>
      );
    case "perks":
      return (
        <>
          <TitleField id={`${id}-t`} value={s.title} placeholder={SECTION_INFO.perks.defaultTitle} onChange={(title) => update({ title })} />
          <PerksEditor perks={careers.perks} onChange={(perks) => onChange({ ...careers, perks })} />
        </>
      );
    case "mission":
      return (
        <>
          <TitleField id={`${id}-t`} value={s.title} placeholder={SECTION_INFO.mission.defaultTitle} onChange={(title) => update({ title })} />
          <Field label="Mission statement" htmlFor={`${id}-s`}>
            <input id={`${id}-s`} className={inputCls} value={s.statement} maxLength={LIMITS.statement} placeholder={EXAMPLES.missionStatement}
              onChange={(e) => update({ statement: e.target.value })} />
          </Field>
          <Field label="More detail (optional)" htmlFor={`${id}-b`}>
            <textarea id={`${id}-b`} className={ta} value={s.body} maxLength={LIMITS.body} placeholder={EXAMPLES.missionBody}
              onChange={(e) => update({ body: e.target.value })} />
          </Field>
        </>
      );
    case "values":
    case "process": {
      const isValues = s.type === "values";
      const max = isValues ? LIMITS.values : LIMITS.steps;
      return (
        <>
          <TitleField id={`${id}-t`} value={s.title} placeholder={SECTION_INFO[s.type].defaultTitle} onChange={(title) => update({ title })} />
          <ItemsEditor id={id} items={s.items} max={max} noun={isValues ? "value" : "step"}
            names={isValues ? EXAMPLES.value : EXAMPLES.step} text={isValues ? EXAMPLES.valueText : EXAMPLES.stepText}
            hint={isValues ? "3 to 6 works best." : "2 to 6 steps, in order."}
            onChange={(items) => update({ items })} />
        </>
      );
    }
    case "voices":
      return (
        <>
          <TitleField id={`${id}-t`} value={s.title} placeholder={SECTION_INFO.voices.defaultTitle} onChange={(title) => update({ title })} />
          <QuotesEditor id={id} quotes={s.quotes} onChange={(quotes) => update({ quotes })} />
          <p className="mt-3 text-xs text-gray-500">Only quote people who agreed to be quoted.</p>
        </>
      );
    case "text":
      return (
        <>
          <Field label="Title" htmlFor={`${id}-t`}>
            <input id={`${id}-t`} className={inputCls} value={s.title} maxLength={LIMITS.title} placeholder="Diversity and inclusion"
              onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Text" htmlFor={`${id}-b`}>
            <textarea id={`${id}-b`} className={ta} value={s.body} maxLength={LIMITS.body} placeholder="Anything else candidates should know."
              onChange={(e) => update({ body: e.target.value })} />
          </Field>
        </>
      );
  }
}

function ItemsEditor({ id, items, max, noun, names, text, hint, onChange }: {
  id: string; items: NameText[]; max: number; noun: string; names: string[]; text: string; hint: string; onChange: (items: NameText[]) => void;
}) {
  const set = (i: number, patch: Partial<NameText>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Field label={`${noun[0].toUpperCase()}${noun.slice(1)}s`} hint={hint}>
      <ol className="flex flex-col gap-3">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-5 pt-3 text-xs text-gray-500 text-right shrink-0">{i + 1}</span>
            <div className="flex-1 flex flex-col gap-1.5">
              <label htmlFor={`${id}-n${i}`} className="sr-only">{`${noun} ${i + 1} name`}</label>
              <input id={`${id}-n${i}`} className={inputCls} value={it.name} maxLength={LIMITS.itemName} placeholder={names[i % names.length]}
                onChange={(e) => set(i, { name: e.target.value })} />
              <label htmlFor={`${id}-x${i}`} className="sr-only">{`${noun} ${i + 1} description`}</label>
              <input id={`${id}-x${i}`} className={inputCls} value={it.text} maxLength={LIMITS.itemText} placeholder={text}
                onChange={(e) => set(i, { text: e.target.value })} />
            </div>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${noun} ${i + 1}`} className={btnGhost}>
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, { name: "", text: "" }])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#A50F15] hover:underline">
          <Plus className="w-4 h-4" aria-hidden /> Add {noun}
        </button>
      )}
    </Field>
  );
}

function QuotesEditor({ id, quotes, onChange }: { id: string; quotes: Quote[]; onChange: (q: Quote[]) => void }) {
  const set = (i: number, patch: Partial<Quote>) => onChange(quotes.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Field label="Quotes" hint="1 to 4 quotes.">
      <ol className="flex flex-col gap-4">
        {quotes.map((q, i) => (
          <li key={i} className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1.5">
              <label htmlFor={`${id}-q${i}`} className="sr-only">{`Quote ${i + 1}`}</label>
              <textarea id={`${id}-q${i}`} className={ta} value={q.quote} maxLength={LIMITS.quote} placeholder={EXAMPLES.quote}
                onChange={(e) => set(i, { quote: e.target.value })} />
              <div className="flex gap-1.5">
                <label htmlFor={`${id}-pn${i}`} className="sr-only">Name</label>
                <input id={`${id}-pn${i}`} className={inputCls} value={q.name} maxLength={LIMITS.personName} placeholder="Name" onChange={(e) => set(i, { name: e.target.value })} />
                <label htmlFor={`${id}-pr${i}`} className="sr-only">Role</label>
                <input id={`${id}-pr${i}`} className={inputCls} value={q.role} maxLength={LIMITS.personRole} placeholder="Role" onChange={(e) => set(i, { role: e.target.value })} />
              </div>
            </div>
            <button type="button" onClick={() => onChange(quotes.filter((_, j) => j !== i))} aria-label={`Remove quote ${i + 1}`} className={btnGhost}>
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
      {quotes.length < LIMITS.quotes && (
        <button type="button" onClick={() => onChange([...quotes, { name: "", role: "", quote: "" }])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#A50F15] hover:underline">
          <Plus className="w-4 h-4" aria-hidden /> Add quote
        </button>
      )}
    </Field>
  );
}

function PerksEditor({ perks, onChange }: { perks: string[]; onChange: (p: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const has = (p: string) => perks.some((x) => x.toLowerCase() === p.toLowerCase());
  const toggle = (p: string) => onChange(has(p) ? perks.filter((x) => x.toLowerCase() !== p.toLowerCase()) : [...perks, p].slice(0, MAX_PERKS));
  const extra = perks.filter((p) => !PERK_OPTIONS.some((o) => o.toLowerCase() === p.toLowerCase()));
  return (
    <Field label="Perks" hint="Your company perks: also shown on every job.">
      <div className="flex flex-wrap gap-2">
        {[...PERK_OPTIONS, ...extra].map((p) => {
          const on = has(p);
          return (
            <button key={p} type="button" aria-pressed={on} onClick={() => toggle(p)}
              className={`min-h-[36px] px-3 rounded-full border text-sm transition-colors ${on ? "bg-[#A50F15] border-[#A50F15] text-white" : "border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"}`}>
              {p}
            </button>
          );
        })}
      </div>
      {perks.length < MAX_PERKS && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = custom.trim(); if (v && !has(v)) onChange([...perks, v]); setCustom(""); }}>
          <label htmlFor="custom-perk" className="sr-only">Add your own perk</label>
          <input id="custom-perk" className={inputCls} value={custom} maxLength={MAX_PERK_LENGTH} placeholder="Add your own perk" onChange={(e) => setCustom(e.target.value)} />
          <button type="submit" className={btnSecondary}>Add</button>
        </form>
      )}
    </Field>
  );
}

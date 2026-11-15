/**
 * "Life at {company}" sections for the careers widget and the hosted company page. Client-safe.
 *
 * Fixed section types, plain text only (React escapes everything; nothing is rendered as HTML). Saved as one JSON value
 * on the workspace and validated on save and on read, so old or tampered data still renders safely.
 * The Intro and Perks sections hold no text of their own: they show the company description / careers headline and the
 * existing perks list, so each thing is edited in one place.
 */

export const SECTION_TYPES = ['intro', 'mission', 'values', 'perks', 'process', 'voices', 'text'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export interface NameText { name: string; text: string }
export interface Quote { name: string; role: string; quote: string }

export type CareersSection =
  | { id: string; type: 'intro'; enabled: boolean }
  | { id: string; type: 'perks'; enabled: boolean; title: string }
  | { id: string; type: 'mission'; enabled: boolean; title: string; statement: string; body: string }
  | { id: string; type: 'values'; enabled: boolean; title: string; items: NameText[] }
  | { id: string; type: 'process'; enabled: boolean; title: string; items: NameText[] }
  | { id: string; type: 'voices'; enabled: boolean; title: string; quotes: Quote[] }
  | { id: string; type: 'text'; enabled: boolean; title: string; body: string };

export const TEMPLATES = ['startup', 'classic', 'minimal', 'bold', 'editorial', 'split'] as const;
export type CareersTemplate = (typeof TEMPLATES)[number];

/** Each template is a real careers-page layout with a fixed order; "roles" is where the open roles go. */
export const TEMPLATE_INFO: Record<CareersTemplate, { label: string; blurb: string; order: (SectionType | 'roles')[] }> = {
  startup: {
    label: 'Launch', blurb: 'Big type on a soft brand glow, key facts, roles near the top.',
    order: ['intro', 'roles', 'mission', 'values', 'perks', 'process', 'voices', 'text'],
  },
  classic: {
    label: 'Story', blurb: 'Centred and narrative: mission and values first, then roles.',
    order: ['intro', 'mission', 'values', 'roles', 'perks', 'process', 'voices', 'text'],
  },
  minimal: {
    label: 'Minimal', blurb: 'One quiet column with hairline lists. Roles right after the intro.',
    order: ['intro', 'roles', 'perks', 'process', 'mission', 'values', 'voices', 'text'],
  },
  bold: {
    label: 'Midnight', blurb: 'Dark and premium, with a brand glow. Confident and technical.',
    order: ['intro', 'roles', 'values', 'perks', 'mission', 'process', 'voices', 'text'],
  },
  editorial: {
    label: 'Letter', blurb: 'A personal note from the team, in serif type. Warm and human.',
    order: ['intro', 'mission', 'values', 'roles', 'process', 'perks', 'voices', 'text'],
  },
  split: {
    label: 'Bento', blurb: 'Your story as a grid of tiles: roles count, facts, mission, perks.',
    order: ['intro', 'roles', 'perks', 'values', 'process', 'mission', 'voices', 'text'],
  },
};

export interface CareersContent {
  template: CareersTemplate;
  /** One entry per section type (Custom text up to 3); the template decides the order. */
  sections: CareersSection[];
  /** Hide "Powered by Udyaibase" (honoured on paid plans only). */
  hideBranding: boolean;
}

/** What each section is for, shown in "Add section". `max` is how many of that type a page may have. */
export const SECTION_INFO: Record<SectionType, { label: string; blurb: string; max: number; defaultTitle: string }> = {
  intro: { label: 'Intro', blurb: 'A headline and a short paragraph about the company.', max: 1, defaultTitle: '' },
  mission: { label: 'Mission', blurb: 'Why the company exists, in one statement.', max: 1, defaultTitle: 'Our mission' },
  values: { label: 'Values', blurb: 'How the team works, as 3 to 6 short cards.', max: 1, defaultTitle: 'Our values' },
  perks: { label: 'Perks & benefits', blurb: 'Your perks list, shown as a grid.', max: 1, defaultTitle: 'Perks & benefits' },
  process: { label: 'Hiring process', blurb: 'What happens after someone applies, step by step.', max: 1, defaultTitle: 'How we hire' },
  voices: { label: 'Team voices', blurb: 'Short quotes from people on the team.', max: 1, defaultTitle: 'From the team' },
  text: { label: 'Custom text', blurb: 'A title and a paragraph, such as a diversity statement.', max: 3, defaultTitle: '' },
};

export const LIMITS = {
  sections: 10,
  title: 60,
  statement: 200,
  body: 1200,
  itemName: 50,
  itemText: 200,
  values: 6,
  steps: 6,
  quotes: 4,
  quote: 400,
  personName: 60,
  personRole: 60,
  headline: 100,
  description: 1000,
} as const;

/** Plain text: control characters removed (newlines kept in paragraphs), trimmed, clipped. */
export function plain(v: unknown, max: number, multiline = false): string {
  if (typeof v !== 'string') return '';
  const s = multiline
    ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n')
    : v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

const newId = () => Math.random().toString(36).slice(2, 10);
const cleanId = (v: unknown) => (typeof v === 'string' && /^[a-z0-9]{4,16}$/i.test(v) ? v : newId());

function nameTexts(v: unknown, max: number): NameText[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map((x) => ({ name: plain(x?.name, LIMITS.itemName), text: plain(x?.text, LIMITS.itemText) }));
}

/** One section, or null when the type is unknown. Empty text is allowed while editing; rendering skips empty sections. */
function parseSection(raw: any): CareersSection | null {
  if (!raw || typeof raw !== 'object' || !SECTION_TYPES.includes(raw.type)) return null;
  const base = { id: cleanId(raw.id), enabled: raw.enabled !== false };
  const title = plain(raw.title, LIMITS.title);
  switch (raw.type as SectionType) {
    case 'intro': return { ...base, type: 'intro' };
    case 'perks': return { ...base, type: 'perks', title };
    case 'mission': return { ...base, type: 'mission', title, statement: plain(raw.statement, LIMITS.statement), body: plain(raw.body, LIMITS.body, true) };
    case 'values': return { ...base, type: 'values', title, items: nameTexts(raw.items, LIMITS.values) };
    case 'process': return { ...base, type: 'process', title, items: nameTexts(raw.items, LIMITS.steps) };
    case 'voices': return {
      ...base, type: 'voices', title,
      quotes: (Array.isArray(raw.quotes) ? raw.quotes : []).slice(0, LIMITS.quotes).map((q: any) => ({
        name: plain(q?.name, LIMITS.personName), role: plain(q?.role, LIMITS.personRole), quote: plain(q?.quote, LIMITS.quote, true),
      })),
    };
    case 'text': return { ...base, type: 'text', title, body: plain(raw.body, LIMITS.body, true) };
  }
}

/** Starting point for a company that has saved nothing yet: the Intro and Perks sections, filled from its profile. */
export function defaultCareersContent(): CareersContent {
  return {
    sections: [
      { id: 'intro0001', type: 'intro', enabled: true },
      { id: 'perks0001', type: 'perks', enabled: true, title: '' },
    ],
    template: 'startup',
    hideBranding: false,
  };
}

/** Tolerant: unknown types are dropped, per-type limits enforced, ids de-duplicated. Null gives the defaults. */
export function parseCareersContent(raw: unknown): CareersContent {
  if (!raw || typeof raw !== 'object') return defaultCareersContent();
  const r = raw as Record<string, unknown>;
  const counts: Partial<Record<SectionType, number>> = {};
  const ids = new Set<string>();
  const sections: CareersSection[] = [];
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    const parsed = parseSection(s);
    if (!parsed) continue;
    const n = (counts[parsed.type] ?? 0) + 1;
    if (n > SECTION_INFO[parsed.type].max || sections.length >= LIMITS.sections) continue;
    counts[parsed.type] = n;
    if (ids.has(parsed.id)) parsed.id = newId();
    ids.add(parsed.id);
    sections.push(parsed);
  }
  const template = TEMPLATES.includes(r.template as CareersTemplate) ? (r.template as CareersTemplate) : 'startup';
  return { sections: orderFor(template, sections), template, hideBranding: r.hideBranding === true };
}

/** Sections in the template's order (Custom text keeps its own relative order). */
export function orderFor(template: CareersTemplate, sections: CareersSection[]): CareersSection[] {
  const rank = (t: SectionType) => TEMPLATE_INFO[template].order.indexOf(t);
  return sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.type) - rank(b.s.type) || a.i - b.i).map((x) => x.s);
}

/** A blank section of a type, for "Add section". Example wording lives in the editor's placeholders, never in saved data. */
export function blankSection(type: SectionType): CareersSection {
  const base = { id: newId(), enabled: true, title: '' };
  switch (type) {
    case 'intro': return { id: base.id, enabled: true, type: 'intro' };
    case 'perks': return { ...base, type: 'perks' };
    case 'mission': return { ...base, type: 'mission', statement: '', body: '' };
    case 'values': return { ...base, type: 'values', items: [{ name: '', text: '' }, { name: '', text: '' }, { name: '', text: '' }] };
    case 'process': return { ...base, type: 'process', items: [{ name: '', text: '' }, { name: '', text: '' }] };
    case 'voices': return { ...base, type: 'voices', quotes: [{ name: '', role: '', quote: '' }] };
    case 'text': return { ...base, type: 'text', body: '' };
  }
}

/** The company details the Intro and Perks sections show. */
export interface CareersProfile { name: string; headline: string | null; description: string | null; perks: string[] }

/** A section ready to show, with empty items dropped; null when there is nothing to show. */
export type VisibleSection =
  | { id: string; type: 'intro'; title: string; headline: string; body: string }
  | { id: string; type: 'perks'; title: string; perks: string[] }
  | { id: string; type: 'mission'; title: string; statement: string; body: string }
  | { id: string; type: 'values' | 'process'; title: string; items: NameText[] }
  | { id: string; type: 'voices'; title: string; quotes: Quote[] }
  | { id: string; type: 'text'; title: string; body: string };

export function visibleSections(content: CareersContent, profile: CareersProfile): VisibleSection[] {
  const out: VisibleSection[] = [];
  const titleOf = (s: { type: SectionType; title?: string }) => s.title || SECTION_INFO[s.type].defaultTitle;
  for (const s of content.sections) {
    if (!s.enabled) continue;
    switch (s.type) {
      case 'intro': {
        const headline = profile.headline?.trim() ?? '';
        const body = profile.description?.trim() ?? '';
        if (headline || body) out.push({ id: s.id, type: 'intro', title: `About ${profile.name}`, headline, body });
        break;
      }
      case 'perks':
        if (profile.perks.length) out.push({ id: s.id, type: 'perks', title: titleOf(s), perks: profile.perks });
        break;
      case 'mission':
        if (s.statement || s.body) out.push({ id: s.id, type: 'mission', title: titleOf(s), statement: s.statement, body: s.body });
        break;
      case 'values':
      case 'process': {
        const items = s.items.filter((i) => i.name);
        if (items.length) out.push({ id: s.id, type: s.type, title: titleOf(s), items });
        break;
      }
      case 'voices': {
        const quotes = s.quotes.filter((q) => q.quote && q.name);
        if (quotes.length) out.push({ id: s.id, type: 'voices', title: titleOf(s), quotes });
        break;
      }
      case 'text':
        if (s.body) out.push({ id: s.id, type: 'text', title: s.title, body: s.body });
        break;
    }
  }
  return out;
}

// ── Starter content ───────────────────────────────────

/**
 * Professional starter text a company gets when it picks a template, so the page never starts blank. It only fills
 * sections that are empty, and is plain, editable text. Perks and team quotes are never invented: perks show on every
 * job, and quotes must come from real people.
 */
export function starterHeadline(company: string): string {
  return `Do the best work of your career at ${company}`;
}

export function starterSections(company: string): CareersSection[] {
  return [
    {
      id: 'mission01', type: 'mission', enabled: true, title: '',
      statement: `At ${company}, we use AI to solve problems that matter to people across India.`,
      body: 'We are a focused team that ships often, learns from customers every week and takes pride in doing the work properly.',
    },
    {
      id: 'values01', type: 'values', enabled: true, title: '',
      items: [
        { name: 'Customers first', text: 'We start from the problem, not the technology.' },
        { name: 'Ship and learn', text: 'Small releases, real feedback, steady progress.' },
        { name: 'Own the outcome', text: 'You see your work through, from idea to impact.' },
        { name: 'Candid and kind', text: 'Direct feedback, always delivered with care.' },
      ],
    },
    {
      id: 'process01', type: 'process', enabled: true, title: '',
      items: [
        { name: 'Apply', text: 'Send your resume. A real person reads every application.' },
        { name: 'Intro call', text: 'A short chat about you, the role and what you want next.' },
        { name: 'Skills conversation', text: 'A practical discussion about real work. No trick questions.' },
        { name: 'Meet the team', text: 'Talk to the people you would work with, then hear from us.' },
      ],
    },
  ];
}

/** True when a section still holds starter text (so the editor can remind people to make it their own). */
export function isStarter(s: CareersSection, company: string): boolean {
  const starter = starterSections(company).find((x) => x.type === s.type);
  return !!starter && JSON.stringify({ ...starter, id: '', enabled: true, title: '' }) === JSON.stringify({ ...s, id: '', enabled: true, title: '' });
}

const isEmptySection = (s: CareersSection): boolean => {
  switch (s.type) {
    case 'mission': return !s.statement.trim() && !s.body.trim();
    case 'values': case 'process': return !s.items.some((i) => i.name.trim());
    case 'voices': return !s.quotes.some((q) => q.quote.trim());
    case 'text': return !s.body.trim();
    default: return false;
  }
};

/** Fills empty or missing Mission, Values and Hiring process sections with starter text; everything else is kept. */
export function withStarter(content: CareersContent, company: string): CareersContent {
  const sections = [...content.sections];
  for (const st of starterSections(company)) {
    const i = sections.findIndex((x) => x.type === st.type);
    if (i === -1) sections.push({ ...st, id: `${st.type.slice(0, 4)}${Math.random().toString(36).slice(2, 8)}` });
    else if (isEmptySection(sections[i])) sections[i] = { ...st, id: sections[i].id, title: (sections[i] as { title?: string }).title ?? '' } as CareersSection;
  }
  return { ...content, sections: orderFor(content.template, sections) };
}

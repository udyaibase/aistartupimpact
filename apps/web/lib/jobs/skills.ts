import { SKILLS, baseKey } from '@udyaibase/utils/skill-dictionary';

/**
 * Deterministic skill matching (no AI): skill names compared after normalising case, punctuation and the aliases in
 * the skills dictionary (packages/utils/skill-dictionary.ts). On the server, changes approved in admin (database)
 * are layered on top with setSkillOverrides; in the browser only the base dictionary applies.
 */

/** Every alias (and each canonical name) → the canonical key. Loose aliases only appear in TAG_ALIASES. */
const TEXT_ALIASES: Record<string, string> = {};
const TAG_ALIASES: Record<string, string> = {};
/** Tokens that are also everyday words: they count in resume text only when written as the tool's name. */
const AMBIGUOUS = new Set<string>();
/** Canonical key → the canonical keys it implies (Next.js → React). */
const IMPLIES: Record<string, string[]> = {};
/** Canonical key → display name. */
const NAMES: Record<string, string> = {};

for (const e of SKILLS) {
  const key = baseKey(e.name);
  NAMES[key] = e.name;
  for (const a of [e.name, ...(e.aliases ?? [])]) { TEXT_ALIASES[baseKey(a)] = key; TAG_ALIASES[baseKey(a)] = key; }
  for (const a of e.loose ?? []) TAG_ALIASES[baseKey(a)] = key;
  if (e.ambiguous) {
    if (!/\s/.test(e.name)) AMBIGUOUS.add(baseKey(e.name));
    for (const a of e.aliases ?? []) if (/^[a-z]+$/.test(a) && a.length <= 5) AMBIGUOUS.add(baseKey(a));
  }
}
for (const e of SKILLS) if (e.implies?.length) IMPLIES[baseKey(e.name)] = e.implies.map(baseKey);

/** Admin-approved additions from the database (server only). */
let overrides: { aliases: Record<string, string>; ambiguous: Set<string>; notAmbiguous: Set<string>; implies: Record<string, string[]>; names: Record<string, string> } = {
  aliases: {}, ambiguous: new Set(), notAmbiguous: new Set(), implies: {}, names: {},
};

export function setSkillOverrides(o: { aliases?: Record<string, string>; ambiguous?: string[]; notAmbiguous?: string[]; implies?: Record<string, string[]>; names?: Record<string, string> }) {
  overrides = {
    aliases: o.aliases ?? {}, ambiguous: new Set(o.ambiguous ?? []), notAmbiguous: new Set(o.notAmbiguous ?? []),
    implies: o.implies ?? {}, names: o.names ?? {},
  };
}

/** The canonical key for a skill tag (a job's skill, a ticked skill, a skills-list item). */
export function normalizeSkill(s: string): string {
  const key = baseKey(s);
  return overrides.aliases[key] ?? TAG_ALIASES[key] ?? key;
}

/** The canonical key for a word or phrase found in resume text, or null if it isn't a known way to write a skill. */
export function textSkillKey(s: string): string {
  const key = baseKey(s);
  return overrides.aliases[key] ?? TEXT_ALIASES[key] ?? key;
}

/** Whether a single token is also an everyday word (Go, React, Spark): it needs to be written as the tool's name. */
export function isAmbiguousSkill(key: string): boolean {
  if (overrides.notAmbiguous.has(key)) return false;
  return AMBIGUOUS.has(key) || overrides.ambiguous.has(key);
}

/** Canonical keys that imply this one (React ← Next.js, Redux, React Native). */
export function impliedBy(key: string): string[] {
  const out: string[] = [];
  for (const [from, to] of Object.entries({ ...IMPLIES, ...mergeImplies() })) if (to.includes(key)) out.push(from);
  return out;
}
function mergeImplies(): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(overrides.implies)) merged[k] = Array.from(new Set([...(IMPLIES[k] ?? []), ...v]));
  return merged;
}

/** Whether the dictionary (base or approved additions) knows this key as a skill or an alias of one. */
export function isKnownSkill(s: string): boolean {
  const key = baseKey(s);
  return key in TAG_ALIASES || key in overrides.aliases || Object.values(overrides.aliases).includes(key) || key in overrides.names;
}

/** Display name for a canonical key, if known. */
export function skillName(key: string): string | null {
  return overrides.names[key] ?? NAMES[key] ?? null;
}

/** Job skills the candidate has, in the job's own wording. */
export function matchSkills(jobSkills: string[], candidateSkills: string[]): string[] {
  const have = new Set(candidateSkills.map(normalizeSkill).filter(Boolean));
  return jobSkills.filter((s) => have.has(normalizeSkill(s)));
}

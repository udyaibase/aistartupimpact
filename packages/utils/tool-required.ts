/**
 * What an AI tool listing must have before it is saved, in the admin and in the founder portal alike:
 * a logo, a description, the LinkedIn page, at least one key feature and one use case, the launch year and
 * the headquarters country. One list, so both forms and both servers ask for the same things.
 */

export const TOOL_FIRST_LAUNCH_YEAR = 1950;

export interface ToolRequiredInput {
  logoUrl?: string | null;
  description?: string | null;
  linkedinUrl?: string | null;
  features?: readonly string[] | null;
  useCases?: readonly string[] | null;
  launchYear?: number | string | null;
  headquartersCountry?: string | null;
}

export type ToolRequiredField = 'logoUrl' | 'description' | 'linkedinUrl' | 'features' | 'useCases' | 'launchYear' | 'headquartersCountry';

export interface ToolProblem { field: ToolRequiredField; message: string }

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const anyLine = (list: readonly string[] | null | undefined) => Array.isArray(list) && list.some((t) => filled(t));

/** A LinkedIn address: linkedin.com or a subdomain of it, over https. */
export function isLinkedinUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(u.hostname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Every required detail that is missing or wrong, in the order the forms show them. Empty when the listing is complete. */
export function toolProblems(d: ToolRequiredInput, now: Date = new Date()): ToolProblem[] {
  const out: ToolProblem[] = [];
  if (!filled(d.logoUrl)) out.push({ field: 'logoUrl', message: 'Add a logo.' });
  if (!filled(d.description)) out.push({ field: 'description', message: 'Add a description.' });
  if (!filled(d.linkedinUrl)) out.push({ field: 'linkedinUrl', message: 'Add the LinkedIn page.' });
  else if (!isLinkedinUrl(String(d.linkedinUrl))) out.push({ field: 'linkedinUrl', message: 'The LinkedIn link must be a linkedin.com address starting with https://.' });
  if (!anyLine(d.features)) out.push({ field: 'features', message: 'Add at least one key feature.' });
  if (!anyLine(d.useCases)) out.push({ field: 'useCases', message: 'Add at least one use case.' });
  const year = typeof d.launchYear === 'string' ? Number(d.launchYear) : d.launchYear;
  const thisYear = now.getFullYear();
  if (year == null || !Number.isInteger(year) || year === 0) out.push({ field: 'launchYear', message: 'Add the launch year.' });
  else if (year < TOOL_FIRST_LAUNCH_YEAR || year > thisYear) out.push({ field: 'launchYear', message: `The launch year must be between ${TOOL_FIRST_LAUNCH_YEAR} and ${thisYear}.` });
  if (!filled(d.headquartersCountry)) out.push({ field: 'headquartersCountry', message: 'Choose the headquarters country.' });
  return out;
}

/** One sentence for a toast or an error line, or null when nothing is missing. */
export function toolRequiredError(d: ToolRequiredInput, now?: Date): string | null {
  const problems = toolProblems(d, now);
  if (!problems.length) return null;
  return problems.length === 1 ? problems[0].message : `${problems.length} details are missing: ${problems.map((p) => p.message.replace(/\.$/, '')).join('; ')}.`;
}

/**
 * Editing a tool that already exists. Tools listed before these details became required may stay as they are, so
 * an old tool can still be corrected; but a detail the tool already has cannot be removed or made invalid.
 * Returns the sentence to show, or null when the edit may be saved.
 */
export function toolEditError(next: ToolRequiredInput, stored: ToolRequiredInput, now?: Date): string | null {
  const alreadyMissing = new Set(toolProblems(stored, now).map((p) => p.field));
  const blocked = toolProblems(next, now).filter((p) => !alreadyMissing.has(p.field));
  if (!blocked.length) return null;
  return blocked.length === 1 ? blocked[0].message : `${blocked.length} details are missing: ${blocked.map((p) => p.message.replace(/\.$/, '')).join('; ')}.`;
}

/** For a non-blocking reminder on the edit screens: what the listing still lacks, as a short list. */
export function toolMissingList(d: ToolRequiredInput, now?: Date): string[] {
  const names: Record<ToolRequiredField, string> = {
    logoUrl: 'logo', description: 'description', linkedinUrl: 'LinkedIn page', features: 'key features', useCases: 'use cases',
    launchYear: 'launch year', headquartersCountry: 'headquarters country',
  };
  return toolProblems(d, now).map((p) => names[p.field]);
}

/**
 * The founder portal asks for the LinkedIn page and the headquarters on every save, new or old: a founder always
 * knows both. Used for tools (country) and startups (city). Returns the sentence to show, or null.
 */
export function founderMustHaveError(d: { linkedinUrl?: string | null; headquarters?: string | null }): string | null {
  if (!filled(d.linkedinUrl)) return 'Add your LinkedIn page.';
  if (!isLinkedinUrl(String(d.linkedinUrl))) return 'The LinkedIn link must be a linkedin.com address starting with https://.';
  if (!filled(d.headquarters)) return 'Choose your headquarters.';
  return null;
}

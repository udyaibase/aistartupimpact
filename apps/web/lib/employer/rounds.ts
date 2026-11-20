/** Interview rounds per job, e.g. "Screening call", "Technical", "Final". */
export const DEFAULT_ROUND = 'Interview';
export const MAX_ROUNDS = 6;
export const ROUND_NAME_MAX = 40;

/** The job's rounds in order; a job without named rounds has one "Interview" round. */
export function roundsOf(interviewRounds: string[] | null | undefined): string[] {
  return interviewRounds && interviewRounds.length ? interviewRounds : [DEFAULT_ROUND];
}

/** Trims, drops blanks and repeats (case-insensitive), caps the count and length. Null when nothing usable. */
export function cleanRounds(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const name = v.trim().replace(/\s+/g, ' ').slice(0, ROUND_NAME_MAX);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length === MAX_ROUNDS) break;
  }
  return out;
}

/** Key skills an interviewer rates (must-haves first), or general ones when the job lists none. */
export function scorecardSkills(job: { skills: string[]; mustHaveSkills: string[] }): string[] {
  const must = job.mustHaveSkills.filter((s) => job.skills.includes(s));
  const list = [...must, ...job.skills.filter((s) => !must.includes(s))].slice(0, 6);
  return list.length ? list : ['Problem solving', 'Role knowledge', 'Communication'];
}

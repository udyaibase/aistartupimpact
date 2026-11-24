import type { ExtractedResume } from '@/lib/jobs/resume-extract';

/**
 * Types and the team-facing summary of a structured resume profile (resume engine step 2). No runtime imports, so
 * pages and the panel's data loader can use it without loading the PDF reader. Building lives in resume-profile.ts.
 */

export type SectionKind = 'summary' | 'experience' | 'projects' | 'education' | 'skills' | 'certifications' | 'achievements' | 'other';
export interface YearMonth { y: number; m: number }
export interface DateRange { start: YearMonth | null; end: YearMonth | 'present' | null }

export interface ProfileRole {
  title: string; company: string; dateText: string; range: DateRange; months: number | null;
  internship: boolean; headerLines: number[]; bulletLines: number[];
}
export interface ResumeProfileData {
  version: string;
  /** Identity-redacted lines; line N is lines[N - 1]. */
  lines: string[];
  extract: Pick<ExtractedResume, 'pageCount' | 'pagesRead' | 'lowTextPages' | 'twoColumnPages' | 'format'>;
  sections: { kind: SectionKind; start: number; end: number }[];
  roles: ProfileRole[];
  projects: { name: string; lines: number[] }[];
  education: { degree: string; institution: string; dateText: string; endYear: number | null; lines: number[] }[];
  certifications: { name: string; lines: number[] }[];
  skillLines: number[];
  experience: {
    /** Months worked, overlapping jobs counted once. Internships excluded from `months`, counted in `internMonths`. */
    months: number; internMonths: number; years: number;
    /** Roles with readable dates / all roles. */
    datedRoles: number; roles: number;
    /** For the timeline only. Never used in any score. */
    gaps: { from: YearMonth; to: YearMonth; months: number }[];
  };
  /** How much of the resume could be read and structured: drives the confidence label later. */
  quality: { readable: boolean; scannedPages: number; unplacedShare: number };
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = (d: YearMonth) => `${MONTH_SHORT[d.m - 1]} ${d.y}`;

/** What the hiring team sees in "From the resume": names, dates and worked-out experience, no resume text. */
export function profileSummary(p: ResumeProfileData) {
  return {
    readable: p.quality.readable,
    pageCount: p.extract.pageCount,
    scannedPages: p.quality.scannedPages,
    years: p.experience.years,
    internMonths: p.experience.internMonths,
    datedRoles: p.experience.datedRoles,
    roles: p.roles.map((r) => ({ title: r.title, company: r.company, dateText: r.dateText, months: r.months, internship: r.internship, current: r.range.end === 'present' })),
    education: p.education.map((e) => ({ degree: e.degree, institution: e.institution, endYear: e.endYear })),
    certifications: p.certifications.map((c) => c.name).filter(Boolean),
    projects: p.projects.length,
    /** Timeline context only; never used in any score. */
    gaps: p.experience.gaps.map((g) => ({ label: `${ym(g.from)} – ${ym(g.to)}`, months: g.months })),
  };
}
export type ProfileSummary = ReturnType<typeof profileSummary>;

/**
 * Places where what the candidate typed doesn't match the resume's dates, for the team to check. Never used in a
 * score, never shown to the candidate. Only when the resume was read and its roles have dates.
 */
export function answerMismatches(p: ResumeProfileData, app: {
  experienceYears: number | null;
  screeningAnswers: unknown;
}, questions: unknown): string[] {
  if (!p.quality.readable || p.experience.datedRoles === 0) return [];
  const resumeYears = p.experience.years;
  const yrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} year${n === 1 ? '' : 's'}`;
  const out: string[] = [];
  if (app.experienceYears != null && app.experienceYears - resumeYears >= 2) {
    out.push(`Says ${yrs(app.experienceYears)} of experience; the resume’s role dates add up to ${yrs(resumeYears)}.`);
  }
  const qs = (Array.isArray(questions) ? questions : []) as { id: string; question: string; type: string }[];
  const answers = new Map(((Array.isArray(app.screeningAnswers) ? app.screeningAnswers : []) as { id: string; answer: string }[]).map((a) => [a?.id, String(a?.answer ?? '')]));
  for (const q of qs) {
    if (q?.type !== 'number' || !/\byears?\b/i.test(q.question ?? '')) continue;
    const n = Number((answers.get(q.id) ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)?.[0] ?? NaN);
    // A skill can't have been used for longer than all the work on the resume put together (plus a year of slack).
    if (Number.isFinite(n) && n - resumeYears > 1) out.push(`Answered ${yrs(n)} to “${q.question}”; the resume’s role dates add up to ${yrs(resumeYears)} in total.`);
  }
  return out;
}

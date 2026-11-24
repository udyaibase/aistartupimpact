import { impliedBy, isAmbiguousSkill, normalizeSkill, textSkillKey } from '@/lib/jobs/skills';
import { baseKey } from '@udyaibase/utils/skill-dictionary';
import type { ProfileRole, ResumeProfileData, YearMonth } from '@/lib/jobs/resume-profile-shared';

/**
 * Resume engine step 3: requirements, evidence and the score. Everything here is code; the model's only input is a
 * list of line numbers and fixed choices, which are checked here before they count.
 *
 * Score (out of 100), weights fixed in code:
 *   must-have skills 45 · relevant experience 25 · nice-to-have skills 15 · recency 10 · fit details 5
 * A must-have with no evidence at all caps the score at MUST_CAP.
 *
 * FAIRNESS RULES (permanent): career gaps, college or employer prestige, age, gender and anything personal are never
 * inputs. More experience than the job asks for is never penalised.
 */

export const SCORE_VERSION = 'score-v1';
export const WEIGHTS = { must: 45, experience: 25, nice: 15, recency: 10, details: 5 } as const;
/** Highest score possible while a must-have has no evidence at all. */
export const MUST_CAP = 55;
/**
 * A skill counts as recent when used within this many months of the end of the candidate's latest role, measured from
 * their own most recent work, never from today, so time away from work (caregiving, health, study) can't lower it.
 */
const RECENT_MONTHS = 24;

/** How strongly the resume shows a requirement, strongest first. */
export type EvidenceLevel = 'used' | 'related' | 'listed' | 'claimed' | 'none';
export const LEVEL_CREDIT: Record<EvidenceLevel, number> = { used: 1, related: 0.5, listed: 0.25, claimed: 0.1, none: 0 };
export const LEVEL_LABEL: Record<EvidenceLevel, string> = {
  used: 'Used in work', related: 'Related work', listed: 'Listed only', claimed: 'Ticked on the form only', none: 'Not found',
};

/**
 * Broad skills that work can show without naming them ("built recommendation models" shows machine learning).
 * Only these can be credited as related work by the model; a specific tool or language is either named in work or not.
 */
const CONCEPTS = new Set([
  'machinelearning', 'deeplearning', 'statistics', 'dataanalysis', 'datascience', 'nlp', 'naturallanguageprocessing',
  'computervision', 'systemdesign', 'generativeai', 'llms', 'recommendersystems', 'mlops', 'dataengineering', 'datavisualization',
  'analytics', 'abtesting', 'experimentation', 'distributedsystems', 'microservices', 'apidesign', 'productmanagement',
  'uxdesign', 'uidesign', 'userresearch', 'testing', 'automationtesting', 'devops', 'cloudcomputing', 'security', 'leadership',
]);
export const isConcept = (norm: string) => CONCEPTS.has(norm);

export interface Requirement { id: string; name: string; must: boolean; norm: string; concept: boolean }
export interface EvidenceLine { line: number; text: string; where: string }
export interface RequirementResult {
  id: string; name: string; must: boolean; level: EvidenceLevel; credit: number;
  evidence: EvidenceLine[]; recent: boolean | null; source: 'code' | 'ai' | 'both' | 'form' | 'none';
}
export type Relevance = 'same' | 'related' | 'unrelated';
export type Confidence = 'High' | 'Medium' | 'Low';
export interface BreakdownRow { key: keyof typeof WEIGHTS; label: string; earned: number; max: number; detail: string }

export interface ScoreJob {
  skills: string[]; mustHaveSkills: string[]; experienceMin: number | null; experienceMax: number | null;
}

/* ------------------------------------------------------------------ requirements */

/** The job's checklist. With no must-haves marked, every listed skill is treated as one (as before). */
export function requirementsOf(job: ScoreJob): Requirement[] {
  const must = job.mustHaveSkills.length ? job.mustHaveSkills : job.skills;
  const mustNorm = new Set(must.map(normalizeSkill));
  const seen = new Set<string>();
  const out: Requirement[] = [];
  for (const [name, isMust] of [...must.map((s) => [s, true] as const), ...job.skills.filter((s) => !mustNorm.has(normalizeSkill(s))).map((s) => [s, false] as const)]) {
    const norm = normalizeSkill(name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ id: `R${out.length + 1}`, name, must: isMust, norm, concept: isConcept(norm) });
  }
  return out;
}

/* ------------------------------------------------------------------ finding skills in lines (code) */

/** Normalised skills written in a line, including multi-word ones ("machine learning", "Node.js", "Google Cloud"). */
export function skillsInLine(line: string): Set<string> {
  const found = new Set<string>();
  // Words, remembering which came from a hyphenated compound ("Go-to-Market", "follow-up").
  const words: { w: string; compound: boolean }[] = [];
  for (const chunk of line.split(/[^A-Za-z0-9+#.-]+/)) {
    const parts = chunk.split('-').map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean);
    for (const w of parts) words.push({ w, compound: parts.length > 1 });
  }
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 4 && i + n <= words.length; n++) {
      // Text aliases only: everyday-word aliases ("rest", "growth", "CV") never count inside sentences.
      const norm = textSkillKey(words.slice(i, i + n).map((x) => x.w).join(' '));
      if (!norm) continue;
      // Everyday words count only as the tool's name: capitalised and not inside a hyphenated phrase.
      if (n === 1 && isAmbiguousSkill(baseKey(words[i]!.w)) && (!/^[A-Z]/.test(words[i]!.w) || words[i]!.compound)) continue;
      found.add(norm);
    }
  }
  return found;
}

/* ------------------------------------------------------------------ where a line sits in the resume */

export interface LineMap {
  /** Role index for lines inside a role (header or bullet). */
  role: Map<number, number>;
  /** Role header lines (title, company, dates): naming a skill there is a claim (related at most), not shown work. */
  header: Set<number>;
  /** Project titles and tech-stack lists inside a role or project ("Tech: React, Node.js"): listed only. */
  listed: Set<number>;
  project: Set<number>;
  /** Skills list, certifications, education, summary: mentions that aren't work. */
  mentions: Set<number>;
}

const LIST_LABEL = /^\s*(tech(nolog(y|ies))?(\s+stack)?|stack|tools?(\s+used)?|built\s+(with|using)|skills?(\s+used)?|environment|languages?|frameworks?|libraries)\s*[:\-–]/i;

/** A tech list rather than a description: "Tech: React, Node.js", "React | Node.js | MongoDB". */
export function isListLine(text: string): boolean {
  if (LIST_LABEL.test(text)) return true;
  const parts = text.split(/[,|/•;]+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  const words = parts.reduce((n, x) => n + x.split(/\s+/).length, 0);
  return words / parts.length <= 2.5;
}

/** A project's own title line ("Crop disease classifier" or "Crop disease classifier | PyTorch"), not its description. */
function isProjectTitleLine(text: string, name: string): boolean {
  const t = text.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  if (!n || !t.startsWith(n)) return false;
  return t.length - n.length <= 40 && !/[.]\s/.test(t);
}

export function lineMap(p: ResumeProfileData): LineMap {
  const role = new Map<number, number>();
  p.roles.forEach((r, i) => [...r.headerLines, ...r.bulletLines].forEach((l) => { if (!role.has(l)) role.set(l, i); }));
  const project = new Set(p.projects.flatMap((x) => x.lines).filter((l) => !role.has(l)));
  const projectTitles = p.projects.flatMap((x) => x.lines.filter((l) => isProjectTitleLine(p.lines[l - 1] ?? '', x.name)).slice(0, 1));
  const lists = [...role.keys(), ...project].filter((l) => isListLine(p.lines[l - 1] ?? ''));
  const header = new Set(p.roles.flatMap((r) => r.headerLines));
  const listedInWork = new Set([...projectTitles, ...lists].filter((l) => !header.has(l)));
  const sectionLines = (kinds: string[]) => p.sections.filter((s) => kinds.includes(s.kind)).flatMap((s) => Array.from({ length: s.end - s.start + 1 }, (_, k) => s.start + k));
  const mentions = new Set([...p.skillLines, ...p.certifications.flatMap((c) => c.lines), ...p.education.flatMap((e) => e.lines), ...sectionLines(['skills', 'summary', 'certifications', 'education'])]
    .filter((l) => !role.has(l) && !project.has(l)));
  return { role, header, listed: listedInWork, project, mentions };
}

const ym = (d: YearMonth) => d.y * 12 + (d.m - 1);
const roleLabel = (r: ProfileRole) => [r.title || 'Role', r.company].filter(Boolean).join(', ') + (r.dateText ? ` (${r.dateText})` : '');

function whereOf(line: number, p: ResumeProfileData, map: LineMap): string {
  const ri = map.role.get(line);
  if (ri != null) return roleLabel(p.roles[ri]!);
  if (map.project.has(line)) return `Project: ${p.projects.find((x) => x.lines.includes(line))?.name || 'project'}`;
  if (p.skillLines.includes(line)) return 'Skills list';
  return 'Resume';
}

/** The end of the candidate's latest dated role ("present" counts as today). Null when no role has an end date. */
export function latestWorkEnd(p: ResumeProfileData, now: YearMonth): YearMonth | null {
  let best: number | null = null;
  for (const r of p.roles) {
    if (!r.range.end) continue;
    const e = r.range.end === 'present' ? ym(now) : ym(r.range.end);
    if (best == null || e > best) best = e;
  }
  return best == null ? null : { y: Math.floor(best / 12), m: (best % 12) + 1 };
}

/**
 * Recent = used within RECENT_MONTHS of the end of their latest role (not of today: a career break never makes skills
 * "older"). Null when the dates aren't known.
 */
function isRecent(r: ProfileRole | undefined, latestEnd: YearMonth | null, now: YearMonth): boolean | null {
  if (!r || !r.range.end || !latestEnd) return null;
  const end = r.range.end === 'present' ? ym(now) : ym(r.range.end);
  return ym(latestEnd) - end <= RECENT_MONTHS;
}

/* ------------------------------------------------------------------ model output (checked) */

export interface ModelEvidence {
  requirements: { id: string; lines: number[]; strength: 'direct' | 'related' | 'none' }[];
  roles: { index: number; relevance: Relevance }[];
  summary: string;
  questions: string[];
}

/** Keep only what the lines back up: real line numbers inside work or projects, real requirement ids and role numbers. */
export function checkModelEvidence(raw: any, reqs: Requirement[], p: ResumeProfileData, map: LineMap): ModelEvidence {
  const ids = new Set(reqs.map((r) => r.id));
  const workLines = (xs: unknown) => Array.from(new Set((Array.isArray(xs) ? xs : []).filter((l): l is number => Number.isInteger(l) && (map.role.has(l) || map.project.has(l))))).slice(0, 4);
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
  const requirements = (Array.isArray(raw?.requirements) ? raw.requirements : [])
    .filter((r: any) => ids.has(r?.id) && ['direct', 'related', 'none'].includes(r?.strength))
    .map((r: any) => ({ id: r.id as string, lines: workLines(r.lines), strength: r.strength as 'direct' | 'related' | 'none' }));
  const roles = (Array.isArray(raw?.roles) ? raw.roles : [])
    .filter((r: any) => Number.isInteger(r?.index) && r.index >= 1 && r.index <= p.roles.length && ['same', 'related', 'unrelated'].includes(r?.relevance))
    .map((r: any) => ({ index: r.index as number, relevance: r.relevance as Relevance }));
  return {
    requirements, roles, summary: clip(raw?.summary, 400),
    questions: (Array.isArray(raw?.questions) ? raw.questions : []).map((q: unknown) => clip(q, 200)).filter(Boolean).slice(0, 3),
  };
}

/* ------------------------------------------------------------------ evidence per requirement */

export function judgeRequirements(reqs: Requirement[], p: ResumeProfileData, map: LineMap, model: ModelEvidence | null, confirmedSkills: string[], now: YearMonth): RequirementResult[] {
  const lineSkills = p.lines.map((l) => skillsInLine(l));
  const latestEnd = latestWorkEnd(p, now);
  const ticked = new Set(confirmedSkills.map(normalizeSkill));
  const byId = new Map((model?.requirements ?? []).map((r) => [r.id, r]));

  return reqs.map((req) => {
    const hits = p.lines.map((_, i) => i + 1).filter((l) => lineSkills[l - 1]!.has(req.norm));
    const isWork = (l: number) => ((map.role.has(l) && !map.header.has(l)) || map.project.has(l)) && !map.listed.has(l);
    const codeWork = hits.filter(isWork);
    const codeTitle = hits.filter((l) => map.header.has(l));
    // A skill that implies this one, used in work (Next.js for React, PyTorch for Deep Learning): related, never full.
    const implying = new Set(impliedBy(req.norm));
    const codeImplied = implying.size
      ? p.lines.map((_, i) => i + 1).filter((l) => isWork(l) && [...lineSkills[l - 1]!].some((k) => implying.has(k)))
      : [];
    const codeListed = hits.filter((l) => (!map.role.has(l) && !map.project.has(l)) || map.listed.has(l));
    const m = byId.get(req.id);
    // A "direct" claim only stands on lines that really name the skill; otherwise it's at most related work.
    // Job-title lines are claims: the model can't turn them into "used" either.
    const aiDirect = m?.strength === 'direct' ? m.lines.filter((l) => isWork(l) && lineSkills[l - 1]!.has(req.norm)) : [];
    // Related work counts only for broad skills; for a tool or language the model's "related" is ignored.
    const aiRelated = req.concept && m && m.strength !== 'none' ? m.lines.filter((l) => !aiDirect.includes(l) && !map.listed.has(l)) : [];

    let level: EvidenceLevel = 'none';
    let lines: number[] = [];
    let source: RequirementResult['source'] = 'none';
    if (codeWork.length || aiDirect.length) {
      level = 'used';
      lines = Array.from(new Set([...codeWork, ...aiDirect]));
      source = codeWork.length && aiDirect.length ? 'both' : codeWork.length ? 'code' : 'ai';
    } else if (aiRelated.length || codeTitle.length || codeImplied.length) {
      level = 'related'; lines = Array.from(new Set([...aiRelated, ...codeTitle, ...codeImplied]));
      const fromCode = codeTitle.length > 0 || codeImplied.length > 0;
      source = aiRelated.length && fromCode ? 'both' : aiRelated.length ? 'ai' : 'code';
    } else if (codeListed.length) {
      level = 'listed'; lines = codeListed; source = 'code';
    } else if (ticked.has(req.norm)) {
      level = 'claimed'; source = 'form';
    }
    // Most recent role first, then projects, then the rest; at most 3 lines shown.
    const order = (l: number) => { const ri = map.role.get(l); return ri != null ? ri : map.project.has(l) ? 1000 : 2000; };
    lines.sort((a, b) => order(a) - order(b) || a - b);
    const shown = lines.slice(0, 3);
    const roleIdx = lines.map((l) => map.role.get(l)).filter((x): x is number => x != null);
    const recent = level === 'used' || level === 'related'
      ? roleIdx.length ? roleIdx.some((i) => isRecent(p.roles[i], latestEnd, now) === true) || (roleIdx.every((i) => isRecent(p.roles[i], latestEnd, now) === null) ? null : false) : null
      : null;
    return {
      id: req.id, name: req.name, must: req.must, level, credit: LEVEL_CREDIT[level], recent, source,
      evidence: shown.map((l) => ({ line: l, text: p.lines[l - 1] ?? '', where: whereOf(l, p, map) })),
    };
  });
}

/* ------------------------------------------------------------------ experience, confidence, score */

/** Years of relevant work: same-kind roles fully, related roles at half, internships excluded. Never more than total. */
export function relevantYears(p: ResumeProfileData, relevance: Map<number, Relevance>): number {
  let months = 0;
  p.roles.forEach((r, i) => {
    if (r.internship || r.months == null) return;
    const rel = relevance.get(i + 1);
    months += rel === 'same' ? r.months : rel === 'related' ? r.months / 2 : 0;
  });
  return Math.round((Math.min(months, p.experience.months) / 12) * 10) / 10;
}

/** Credit for experience against the job's minimum. More than the maximum is never penalised. */
/** A fresher or intern role: no experience required (0 years, or at most 1). */
export function isEntryLevel(job: ScoreJob): boolean {
  return job.experienceMin === 0 || (job.experienceMin == null && job.experienceMax != null && job.experienceMax <= 1);
}

/** Credit for experience against the job's minimum. More than the maximum is never penalised. */
export function experienceCredit(years: number, job: ScoreJob): number {
  const need = job.experienceMin && job.experienceMin > 0 ? job.experienceMin : 2;
  return Math.min(1, years / need);
}

/**
 * Entry-level roles: experience can't separate freshers (everyone has none), so this part measures what they did
 * instead: a year of relevant work fills it, 6 months of relevant internship fill three quarters, and each project
 * that describes building something with one of the job's skills counts a quarter, up to half. Someone with real
 * experience still gets full marks.
 */
/** Most of the entry-level experience part projects can fill (half of it). */
export const PROJECT_CAP = 0.5;

export function entryLevelCredit(p: ResumeProfileData, relevance: Map<number, Relevance>, reqs: RequirementResult[]): { credit: number; internMonths: number; projects: number; years: number } {
  const years = relevantYears(p, relevance);
  let internMonths = 0;
  p.roles.forEach((r, i) => {
    if (!r.internship || r.months == null) return;
    const rel = relevance.get(i + 1);
    internMonths += rel === 'same' ? r.months : rel === 'related' ? r.months / 2 : 0;
  });
  // A project counts only when one of its lines describes building something with one of the job's skills: a title
  // plus a tech list ("Tech: React, Node.js") is listed only, however many of those a resume has.
  const map = lineMap(p);
  const wanted = new Set(reqs.map((q) => normalizeSkill(q.name)));
  const projects = p.projects.filter((x) => x.lines.some((l) => map.project.has(l) && !map.listed.has(l) && [...skillsInLine(p.lines[l - 1] ?? '')].some((k) => wanted.has(k)))).length;
  // Projects fill at most half of this part, so a real internship always counts for more: 6 relevant months fill
  // three quarters, a year of relevant work fills it all.
  const credit = Math.min(1, years + Math.min((internMonths / 6) * 0.75, 1) + Math.min(projects * 0.25, PROJECT_CAP));
  return { credit, internMonths: Math.round(internMonths), projects, years };
}

export function confidenceOf(p: ResumeProfileData): Confidence {
  const q = p.quality;
  if (!q.readable || (p.roles.length === 0 && p.projects.length === 0) || q.unplacedShare > 0.5) return 'Low';
  if (q.scannedPages === 0 && p.roles.length > 0 && p.experience.datedRoles === p.roles.length && q.unplacedShare <= 0.25) return 'High';
  return 'Medium';
}

export interface DetailsInput { reasons: { key: string; status: 'pass' | 'partial' | 'fail' | 'unknown'; label: string; detail: string }[]; knockedOut: boolean }

export interface ScoreResult {
  fitScore: number;
  recommendation: 'shortlist' | 'consider' | 'weak';
  confidence: Confidence;
  breakdown: BreakdownRow[];
  capped: string | null;
  relevantYears: number;
}

export function scoreResume(reqs: RequirementResult[], p: ResumeProfileData, relevance: Map<number, Relevance>, job: ScoreJob, details: DetailsInput): ScoreResult {
  const avg = (xs: RequirementResult[]) => (xs.length ? xs.reduce((n, r) => n + r.credit, 0) / xs.length : null);
  const must = reqs.filter((r) => r.must);
  const nice = reqs.filter((r) => !r.must);
  const years = relevantYears(p, relevance);
  const shown = reqs.filter((r) => r.level === 'used' || r.level === 'related');
  const recentKnown = shown.filter((r) => r.recent != null);
  const recency = shown.length ? (recentKnown.length ? recentKnown.filter((r) => r.recent).length / recentKnown.length : 0.5) : 0;
  const detailKeys = ['location', 'notice', 'salary', 'knockout'];
  const ds = details.reasons.filter((r) => detailKeys.includes(r.key));
  const dCredit = details.knockedOut ? 0 : ds.length ? ds.reduce((n, r) => n + (r.status === 'pass' ? 1 : r.status === 'fail' ? 0 : 0.5), 0) / ds.length : null;

  const parts: [keyof typeof WEIGHTS, string, number | null, string][] = [
    ['must', 'Must-have skills', avg(must), must.length ? `${must.filter((r) => r.level === 'used').length} of ${must.length} used in work` : 'None listed'],
    isEntryLevel(job)
      ? (() => {
        const e = entryLevelCredit(p, relevance, reqs);
        const bits = [e.years ? `${e.years} yrs relevant work` : '', e.internMonths ? `${e.internMonths} months of relevant internships` : '', `${e.projects} project${e.projects === 1 ? '' : 's'} showing the job’s skills`].filter(Boolean);
        return ['experience', 'Internships and projects', e.credit, `${bits.join(' · ')} · entry-level role`] as [keyof typeof WEIGHTS, string, number, string];
      })()
      : ['experience', 'Relevant experience', experienceCredit(years, job), `${years} yrs relevant${job.experienceMin != null ? ` · role asks ${job.experienceMin}${job.experienceMax != null ? `–${job.experienceMax}` : '+'} yrs` : ''}`],
    ['nice', 'Nice-to-have skills', avg(nice), nice.length ? `${nice.filter((r) => r.level === 'used' || r.level === 'related').length} of ${nice.length} shown` : 'None listed'],
    ['recency', 'Recent use', shown.length ? recency : 0, shown.length ? `${recentKnown.filter((r) => r.recent).length} of ${shown.length} skills used in their latest 2 years of work` : 'No skills shown in work'],
    ['details', 'Fit details', dCredit, details.knockedOut ? 'Didn’t meet a must-answer question' : ds.length ? ds.map((r) => `${r.label}: ${r.status === 'pass' ? 'yes' : r.status === 'fail' ? 'no' : 'not given'}`).join(' · ') : 'Nothing to check'],
  ];
  // A part with nothing to judge (no nice-to-haves listed, no details) drops out and the rest scale up.
  const live = parts.filter(([, , v]) => v != null);
  const total = live.reduce((n, [k]) => n + WEIGHTS[k], 0);
  const breakdown: BreakdownRow[] = live.map(([key, label, v, detail]) => {
    const max = Math.round((WEIGHTS[key] / total) * 1000) / 10;
    return { key, label, max, earned: Math.round(max * (v as number) * 10) / 10, detail };
  });
  let fitScore = Math.round(breakdown.reduce((n, b) => n + b.earned, 0));
  const missing = must.filter((r) => r.level === 'none');
  let capped: string | null = null;
  if (missing.length && fitScore > MUST_CAP) {
    fitScore = MUST_CAP;
    capped = `Capped at ${MUST_CAP}: no evidence of ${missing.map((r) => r.name).join(', ')}`;
  }
  const confidence = confidenceOf(p);
  const allMustShown = must.every((r) => r.level === 'used' || r.level === 'related');
  const recommendation = fitScore >= 75 && allMustShown && confidence !== 'Low' ? 'shortlist' : fitScore >= 50 ? 'consider' : 'weak';
  return { fitScore, recommendation, confidence, breakdown, capped, relevantYears: years };
}

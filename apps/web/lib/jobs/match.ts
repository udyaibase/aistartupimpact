import { normalizeSkill } from '@/lib/jobs/skills';

/**
 * Explainable match score (free plan). Deterministic rules only, no AI: it compares what the
 * employer asked for with what the candidate entered. It never looks at name, gender, age,
 * college or photo. Missing information earns half credit so leaving fields blank can't
 * push someone up the list. Knockout answers flag a candidate; they are never hidden or rejected.
 */

export interface MatchJob {
  skills: string[];
  mustHaveSkills: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  workType: string;
  city: string | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  maxNoticeDays: number | null;
  screeningQuestions: unknown;
}

export interface MatchApplicant {
  confirmedSkills: string[];
  experienceYears: number | null;
  city: string | null;
  noticePeriodDays: number | null;
  expectedCtcLakh: number | null;
  screeningAnswers: unknown;
}

export type ReasonStatus = 'pass' | 'partial' | 'fail' | 'unknown';

export interface MatchReason {
  key: 'must' | 'nice' | 'experience' | 'location' | 'notice' | 'salary' | 'knockout';
  label: string;
  status: ReasonStatus;
  detail: string;
  /** Points earned / available for this criterion (knockouts carry no points). */
  earned: number;
  weight: number;
}

export interface MatchResult {
  score: number;
  band: 'Strong' | 'Good' | 'Fair' | 'Low';
  knockedOut: boolean;
  reasons: MatchReason[];
}

const W = { must: 40, nice: 10, experience: 20, location: 10, notice: 10, salary: 10 };
const UNKNOWN = 0.5;

const sameCity = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/^bangalore$/, 'bengaluru').replace(/^bombay$/, 'mumbai').replace(/^gurgaon$/, 'gurugram');
  return n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a));
};

const yrs = (n: number) => `${n} year${n === 1 ? '' : 's'}`;

export function computeMatch(job: MatchJob, app: MatchApplicant): MatchResult {
  const reasons: MatchReason[] = [];
  const have = new Set(app.confirmedSkills.map(normalizeSkill));
  const has = (s: string) => have.has(normalizeSkill(s));

  // Skills: must-haves weigh most. Without marked must-haves, every listed skill counts as one.
  const must = job.mustHaveSkills.filter((s) => job.skills.includes(s));
  const mustList = must.length ? must : job.skills;
  const niceList = must.length ? job.skills.filter((s) => !must.includes(s)) : [];
  if (mustList.length) {
    const got = mustList.filter(has);
    const ratio = got.length / mustList.length;
    const missing = mustList.filter((s) => !has(s));
    reasons.push({
      key: 'must', label: must.length ? 'Must-have skills' : 'Skills', weight: W.must + (niceList.length ? 0 : W.nice),
      earned: ratio * (W.must + (niceList.length ? 0 : W.nice)),
      status: ratio === 1 ? 'pass' : ratio >= 0.5 ? 'partial' : 'fail',
      detail: `${got.length} of ${mustList.length}${missing.length ? ` · missing ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}` : ''}`,
    });
  }
  if (niceList.length) {
    const got = niceList.filter(has);
    reasons.push({
      key: 'nice', label: 'Nice-to-have skills', weight: W.nice, earned: (got.length / niceList.length) * W.nice,
      status: got.length === niceList.length ? 'pass' : got.length ? 'partial' : 'fail',
      detail: `${got.length} of ${niceList.length}`,
    });
  }

  // Experience against the job's band.
  if (job.experienceMin != null || job.experienceMax != null) {
    const min = job.experienceMin ?? 0;
    const max = job.experienceMax;
    const band = max != null ? `${min}–${max} years` : `${min}+ years`;
    const y = app.experienceYears;
    if (y == null) {
      reasons.push({ key: 'experience', label: 'Experience', weight: W.experience, earned: W.experience * UNKNOWN, status: 'unknown', detail: `Not given · role asks ${band}` });
    } else if (y >= min && (max == null || y <= max + 2)) {
      reasons.push({ key: 'experience', label: 'Experience', weight: W.experience, earned: W.experience, status: 'pass', detail: `${yrs(y)} · role asks ${band}` });
    } else if (y < min) {
      const gap = min - y;
      const earned = gap <= 1 ? W.experience * 0.6 : gap <= 2 ? W.experience * 0.3 : 0;
      reasons.push({ key: 'experience', label: 'Experience', weight: W.experience, earned, status: earned ? 'partial' : 'fail', detail: `${yrs(y)} · role asks ${band}` });
    } else {
      // Well above the band: still a fit, slightly less likely to stay.
      reasons.push({ key: 'experience', label: 'Experience', weight: W.experience, earned: W.experience * 0.75, status: 'partial', detail: `${yrs(y)} · more than the ${band} asked` });
    }
  }

  // Location: remote fits anyone; on-site/hybrid prefer the job's city.
  if (job.workType === 'REMOTE') {
    reasons.push({ key: 'location', label: 'Location', weight: W.location, earned: W.location, status: 'pass', detail: 'Remote role' });
  } else if (job.city) {
    if (!app.city) {
      reasons.push({ key: 'location', label: 'Location', weight: W.location, earned: W.location * UNKNOWN, status: 'unknown', detail: `City not given · role is in ${job.city}` });
    } else if (sameCity(app.city, job.city)) {
      reasons.push({ key: 'location', label: 'Location', weight: W.location, earned: W.location, status: 'pass', detail: `Based in ${app.city}` });
    } else {
      reasons.push({ key: 'location', label: 'Location', weight: W.location, earned: W.location * 0.3, status: 'partial', detail: `Based in ${app.city} · role is in ${job.city} (may relocate)` });
    }
  }

  // Notice period, only when the employer set a preference.
  if (job.maxNoticeDays != null) {
    const n = app.noticePeriodDays;
    const want = job.maxNoticeDays === 0 ? 'immediate joiners' : `joining within ${job.maxNoticeDays} days`;
    if (n == null) reasons.push({ key: 'notice', label: 'Notice period', weight: W.notice, earned: W.notice * UNKNOWN, status: 'unknown', detail: `Not given · you prefer ${want}` });
    else if (n <= job.maxNoticeDays) reasons.push({ key: 'notice', label: 'Notice period', weight: W.notice, earned: W.notice, status: 'pass', detail: n === 0 ? 'Can join immediately' : `${n} days` });
    else {
      const earned = n <= job.maxNoticeDays + 30 ? W.notice * 0.5 : 0;
      reasons.push({ key: 'notice', label: 'Notice period', weight: W.notice, earned, status: earned ? 'partial' : 'fail', detail: `${n} days · you prefer ${want}` });
    }
  }

  // Salary: expected yearly CTC (₹ lakh) against the job's top of range. INR roles only.
  if (job.salaryMax && (job.salaryCurrency ?? 'INR') === 'INR') {
    const maxL = job.salaryMax / 100_000;
    const e = app.expectedCtcLakh;
    if (e == null) reasons.push({ key: 'salary', label: 'Salary', weight: W.salary, earned: W.salary * UNKNOWN, status: 'unknown', detail: `Expectation not given · range up to ₹${maxL.toFixed(0)} L` });
    else if (e <= maxL) reasons.push({ key: 'salary', label: 'Salary', weight: W.salary, earned: W.salary, status: 'pass', detail: `Expects ₹${e} L · within range` });
    else if (e <= maxL * 1.15) reasons.push({ key: 'salary', label: 'Salary', weight: W.salary, earned: W.salary * 0.5, status: 'partial', detail: `Expects ₹${e} L · slightly above ₹${maxL.toFixed(0)} L` });
    else reasons.push({ key: 'salary', label: 'Salary', weight: W.salary, earned: 0, status: 'fail', detail: `Expects ₹${e} L · above ₹${maxL.toFixed(0)} L` });
  }

  // Knockouts: Yes/No questions with a required answer.
  const questions = (Array.isArray(job.screeningQuestions) ? job.screeningQuestions : []) as { id: string; question: string; type: string; knockoutAnswer?: string }[];
  const answers = new Map(((Array.isArray(app.screeningAnswers) ? app.screeningAnswers : []) as { id: string; answer: string }[]).map((a) => [a.id, a.answer]));
  let knockedOut = false;
  for (const q of questions) {
    if (q.type !== 'yesno' || (q.knockoutAnswer !== 'yes' && q.knockoutAnswer !== 'no')) continue;
    const a = answers.get(q.id);
    const ok = a === q.knockoutAnswer;
    if (!ok) knockedOut = true;
    reasons.push({
      key: 'knockout', label: q.question, weight: 0, earned: 0,
      status: ok ? 'pass' : a ? 'fail' : 'unknown',
      detail: a ? `Answered ${a === 'yes' ? 'Yes' : 'No'} · required ${q.knockoutAnswer === 'yes' ? 'Yes' : 'No'}` : `Not answered · required ${q.knockoutAnswer === 'yes' ? 'Yes' : 'No'}`,
    });
  }
  if (questions.some((q) => q.type === 'yesno' && q.knockoutAnswer) && reasons.some((r) => r.key === 'knockout' && r.status === 'unknown')) knockedOut = true;

  const total = reasons.reduce((n, r) => n + r.weight, 0);
  const earned = reasons.reduce((n, r) => n + r.earned, 0);
  const score = total ? Math.round((earned / total) * 100) : 0;
  const band = score >= 80 ? 'Strong' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Low';
  return { score, band, knockedOut, reasons };
}

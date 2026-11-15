/**
 * Shared model for the employer job composer: form shape, DB conversion, listing strength
 * and templates. Used by the client form and the API so both apply the same rules.
 */

export const JOB_CATEGORIES = [
  { value: 'AI_ENGINEER', label: 'AI Engineer', group: 'AI & ML' },
  { value: 'ML_ENGINEER', label: 'ML Engineer', group: 'AI & ML' },
  { value: 'LLM_ENGINEER', label: 'LLM / GenAI Engineer', group: 'AI & ML' },
  { value: 'AI_RESEARCH_SCIENTIST', label: 'AI Research Scientist', group: 'AI & ML' },
  { value: 'PROMPT_ENGINEER', label: 'Prompt Engineer', group: 'AI & ML' },
  { value: 'NLP_ENGINEER', label: 'NLP Engineer', group: 'AI & ML' },
  { value: 'COMPUTER_VISION', label: 'Computer Vision', group: 'AI & ML' },
  { value: 'ROBOTICS_ENGINEER', label: 'Robotics Engineer', group: 'AI & ML' },
  { value: 'AI_INFRASTRUCTURE', label: 'Infrastructure / MLOps', group: 'AI & ML' },
  { value: 'AI_SOLUTIONS_ARCHITECT', label: 'Solutions Architect', group: 'AI & ML' },
  { value: 'AI_ETHICS', label: 'AI Ethics & Policy', group: 'AI & ML' },
  { value: 'SOFTWARE_ENGINEER', label: 'Software Engineer', group: 'Engineering' },
  { value: 'FRONTEND_ENGINEER', label: 'Frontend Engineer', group: 'Engineering' },
  { value: 'BACKEND_ENGINEER', label: 'Backend Engineer', group: 'Engineering' },
  { value: 'FULL_STACK_ENGINEER', label: 'Full-stack Engineer', group: 'Engineering' },
  { value: 'MOBILE_ENGINEER', label: 'Mobile Engineer', group: 'Engineering' },
  { value: 'DEVOPS_ENGINEER', label: 'DevOps / SRE', group: 'Engineering' },
  { value: 'QA_ENGINEER', label: 'QA / Test Engineer', group: 'Engineering' },
  { value: 'SECURITY_ENGINEER', label: 'Security Engineer', group: 'Engineering' },
  { value: 'ENGINEERING_MANAGER', label: 'Engineering Manager', group: 'Engineering' },
  { value: 'DATA_SCIENTIST', label: 'Data Scientist', group: 'Data' },
  { value: 'DATA_ENGINEER', label: 'Data Engineer', group: 'Data' },
  { value: 'DATA_ANALYST', label: 'Data Analyst', group: 'Data' },
  { value: 'BUSINESS_ANALYST', label: 'Business Analyst', group: 'Data' },
  { value: 'AI_PRODUCT_MANAGER', label: 'Product Manager', group: 'Product & Design' },
  { value: 'PROJECT_MANAGER', label: 'Project / Program Manager', group: 'Product & Design' },
  { value: 'AI_DESIGNER', label: 'Designer', group: 'Product & Design' },
  { value: 'AI_DEVREL', label: 'Developer Relations', group: 'Product & Design' },
  { value: 'AI_SALES', label: 'Sales', group: 'Business' },
  { value: 'BUSINESS_DEVELOPMENT', label: 'Business Development', group: 'Business' },
  { value: 'AI_MARKETING', label: 'Marketing', group: 'Business' },
  { value: 'CONTENT_WRITING', label: 'Content & Writing', group: 'Business' },
  { value: 'CUSTOMER_SUCCESS', label: 'Customer Success', group: 'Business' },
  { value: 'CUSTOMER_SUPPORT', label: 'Customer Support', group: 'Business' },
  { value: 'OPERATIONS', label: 'Operations', group: 'Operations' },
  { value: 'FINANCE', label: 'Finance', group: 'Operations' },
  { value: 'HR_RECRUITING', label: 'HR & Recruiting', group: 'Operations' },
  { value: 'LEGAL', label: 'Legal', group: 'Operations' },
  { value: 'FOUNDERS_OFFICE', label: 'Founder’s Office', group: 'Operations' },
  { value: 'OTHER', label: 'Other', group: 'Other' },
] as const;

/** Label shown for a job's category: the employer's own name when they used a custom one. */
export function categoryText(category: string | null | undefined, categoryLabel?: string | null): string {
  if (category === 'OTHER' && categoryLabel?.trim()) return categoryLabel.trim();
  return JOB_CATEGORIES.find((c) => c.value === category)?.label ?? 'Other';
}

/** Teams offered in the Team dropdown; an employer's own teams (from earlier jobs) are added to these. */
export const DEFAULT_TEAMS = [
  'Engineering', 'AI / ML', 'Data', 'Research', 'Product', 'Design', 'Sales', 'Marketing', 'Growth',
  'Customer Success', 'Operations', 'Finance', 'People / HR', 'Legal', 'Founder’s Office',
] as const;

export const MAX_EXPERIENCE_YEARS = 40;

/** How candidates apply. EXTERNAL covers the last three (stored as a link or an email). */
export const APPLY_VIA = [
  { value: 'udyaibase', label: 'On Udyaibase' },
  { value: 'website', label: 'Company website' },
  { value: 'google_form', label: 'Google Form' },
  { value: 'email', label: 'Email' },
] as const;
export type ApplyVia = (typeof APPLY_VIA)[number]['value'];

export const GOOGLE_FORM_URL = /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)\S+$/i;

export const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'FREELANCE', label: 'Freelance' },
] as const;

export const WORK_TYPES = [
  { value: 'ONSITE', label: 'On-site' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'REMOTE', label: 'Remote' },
] as const;

export const EXPERIENCE_BANDS = [
  { value: '0-1', label: '0–1 years', min: 0, max: 1 },
  { value: '1-3', label: '1–3 years', min: 1, max: 3 },
  { value: '3-5', label: '3–5 years', min: 3, max: 5 },
  { value: '5-8', label: '5–8 years', min: 5, max: 8 },
  { value: '8+', label: '8+ years', min: 8, max: null },
] as const;
/** The Experience control's "Custom" choice: the employer types their own min and max years. */
export const CUSTOM_EXPERIENCE = 'custom';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED'] as const;

export const MAX_SCREENING_QUESTIONS = 3;
export const MAX_SKILLS = 12;
export const DEFAULT_OPEN_DAYS = 30;
export const MAX_OPEN_DAYS = 90;

export interface ScreeningQuestion {
  id: string;
  question: string;
  type: 'text' | 'yesno' | 'choice';
  required: boolean;
  /** Multiple choice only. */
  options?: string[];
  /** Yes/No only: the answer the role needs. A different answer flags the candidate (never auto-rejects). */
  knockoutAnswer?: 'yes' | 'no';
}

/** Form state. Salary is in display units: lakh for INR, thousands for other currencies. */
export interface JobDraft {
  title: string;
  category: string;
  /** Own category name when category is OTHER (custom). */
  categoryLabel: string;
  department: string;
  employmentType: string;
  /** A band value, CUSTOM_EXPERIENCE, or '' for any. */
  experienceBand: string;
  /** Custom experience range in years (strings, as typed). Used when experienceBand is CUSTOM_EXPERIENCE. */
  experienceMin: string;
  experienceMax: string;
  hiringManagerName: string;
  workType: string;
  city: string;
  country: string;
  salaryCurrency: string;
  salaryMin: string;
  salaryMax: string;
  showSalary: boolean;
  hasEsops: boolean;
  shortDescription: string;
  description: string;
  skills: string[];
  screeningQuestions: ScreeningQuestion[];
  applicationType: 'INTERNAL' | 'EXTERNAL';
  /** Which way candidates apply; decides applicationType and which of link or email is used. */
  applyVia: ApplyVia;
  applicationUrl: string;
  applicationEmail: string;
  /** YYYY-MM-DD */
  closesOn: string;
  showOnJobsPage: boolean;
  showOnProfile: boolean;
  showOnCareers: boolean;
  /** Subset of `skills` that are must-haves (weighted higher in the match score). */
  mustHaveSkills: string[];
  /** '' = no preference, otherwise days as a string ('0' = immediate). */
  maxNoticeDays: string;
  /** How many people to hire for this role, as typed (1–MAX_POSITIONS). */
  positions: string;
}

export function salaryUnit(currency: string): { factor: number; suffix: string; symbol: string } {
  if (currency === 'INR') return { factor: 100_000, suffix: 'L', symbol: '₹' };
  const symbol = ({ USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[currency] ?? `${currency} `;
  return { factor: 1_000, suffix: 'K', symbol };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function defaultClosesOn(from = new Date()) {
  return isoDate(new Date(from.getTime() + DEFAULT_OPEN_DAYS * 86_400_000));
}

export function emptyDraft(): JobDraft {
  return {
    title: '', category: 'OTHER', categoryLabel: '', department: '', employmentType: 'FULL_TIME', experienceBand: '', experienceMin: '', experienceMax: '',
    hiringManagerName: '', workType: 'HYBRID', city: '', country: 'India',
    salaryCurrency: 'INR', salaryMin: '', salaryMax: '', showSalary: true, hasEsops: false,
    shortDescription: '', description: '', skills: [], screeningQuestions: [],
    applicationType: 'INTERNAL', applyVia: 'udyaibase', applicationUrl: '', applicationEmail: '',
    closesOn: defaultClosesOn(), showOnJobsPage: true, showOnProfile: true, showOnCareers: true,
    mustHaveSkills: [], maxNoticeDays: '', positions: '1',
  };
}

/** Builds the form from a DB row (salaries stored as whole yearly amounts). */
export function draftFromRow(row: Record<string, any>): JobDraft {
  const base = emptyDraft();
  const currency = row.salaryCurrency || 'INR';
  const { factor } = salaryUnit(currency);
  const toUnit = (n: number | null) => (n ? String(Math.round((n / factor) * 10) / 10) : '');
  const knownBand = EXPERIENCE_BANDS.find((b) => b.value === row.experienceBand)?.value
    || EXPERIENCE_BANDS.find((b) => b.min === row.experienceMin && b.max === row.experienceMax)?.value;
  const hasRange = row.experienceMin != null || row.experienceMax != null;
  const band = knownBand || (hasRange ? CUSTOM_EXPERIENCE : '');
  const external = row.applicationType === 'EXTERNAL';
  const url = String(row.applicationUrl ?? '');
  const applyVia: ApplyVia = !external ? 'udyaibase'
    : url ? (GOOGLE_FORM_URL.test(url) ? 'google_form' : 'website')
    : row.applicationEmail ? 'email' : 'website';
  return {
    ...base,
    title: row.title ?? '',
    category: row.category ?? base.category,
    categoryLabel: row.category === 'OTHER' ? (row.categoryLabel ?? '') : '',
    department: row.department ?? '',
    employmentType: row.employmentType ?? base.employmentType,
    experienceBand: band,
    experienceMin: band === CUSTOM_EXPERIENCE && row.experienceMin != null ? String(row.experienceMin) : '',
    experienceMax: band === CUSTOM_EXPERIENCE && row.experienceMax != null ? String(row.experienceMax) : '',
    hiringManagerName: row.hiringManagerName ?? '',
    workType: row.workType ?? base.workType,
    city: row.city ?? '',
    country: row.country ?? '',
    salaryCurrency: currency,
    salaryMin: toUnit(row.salaryMin),
    salaryMax: toUnit(row.salaryMax),
    showSalary: row.showSalary ?? true,
    hasEsops: !!row.hasEsops,
    shortDescription: row.shortDescription ?? '',
    description: row.description ?? '',
    skills: Array.isArray(row.skills) ? row.skills : [],
    screeningQuestions: Array.isArray(row.screeningQuestions) ? row.screeningQuestions : [],
    applicationType: external ? 'EXTERNAL' : 'INTERNAL',
    applyVia,
    applicationUrl: row.applicationUrl ?? '',
    applicationEmail: row.applicationEmail ?? '',
    closesOn: row.expiresAt ? isoDate(new Date(row.expiresAt)) : defaultClosesOn(),
    showOnJobsPage: row.showOnJobsPage ?? true,
    showOnProfile: row.showOnProfile ?? true,
    showOnCareers: row.showOnCareers ?? true,
    mustHaveSkills: Array.isArray(row.mustHaveSkills) ? row.mustHaveSkills : [],
    maxNoticeDays: row.maxNoticeDays != null ? String(row.maxNoticeDays) : '',
    positions: String(cleanPositions(row.positions)),
  };
}

/** Most openings one job can list (larger hiring drives post more than one job). */
export const MAX_POSITIONS = 500;

/** Whole number of openings, 1–MAX_POSITIONS; anything unreadable is 1. */
export function cleanPositions(v: unknown): number {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_POSITIONS) : 1;
}

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const oneOf = <T extends readonly { value: string }[]>(list: T, v: unknown, fallback: string) =>
  list.some((x) => x.value === v) ? (v as string) : fallback;

/**
 * Validates untrusted form input into DB columns. Never throws: bad values fall back to safe
 * defaults, because drafts autosave half-finished. Publish-time checks live in `publishProblems`.
 */
export function draftToData(input: Partial<JobDraft>) {
  const d = { ...emptyDraft(), ...input };
  const currency = (CURRENCIES as readonly string[]).includes(d.salaryCurrency) ? d.salaryCurrency : 'INR';
  const { factor } = salaryUnit(currency);
  const money = (v: string) => {
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n * factor) : null;
  };
  let salaryMin = money(d.salaryMin);
  let salaryMax = money(d.salaryMax);
  if (salaryMin && salaryMax && salaryMax < salaryMin) [salaryMin, salaryMax] = [salaryMax, salaryMin];
  const band = EXPERIENCE_BANDS.find((b) => b.value === d.experienceBand);
  // Custom range: whole years 0–40, in order; either end may be open.
  const years = (v: unknown) => {
    const n = parseInt(String(v ?? '').trim(), 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_EXPERIENCE_YEARS) : null;
  };
  let customMin = d.experienceBand === CUSTOM_EXPERIENCE ? years(d.experienceMin) : null;
  let customMax = d.experienceBand === CUSTOM_EXPERIENCE ? years(d.experienceMax) : null;
  if (customMin != null && customMax != null && customMax < customMin) [customMin, customMax] = [customMax, customMin];

  const today = new Date();
  let closes = /^\d{4}-\d{2}-\d{2}$/.test(d.closesOn) ? new Date(`${d.closesOn}T23:59:59+05:30`) : null;
  const max = new Date(today.getTime() + MAX_OPEN_DAYS * 86_400_000);
  if (!closes || Number.isNaN(closes.getTime())) closes = new Date(today.getTime() + DEFAULT_OPEN_DAYS * 86_400_000);
  if (closes > max) closes = max;

  const skills = Array.from(new Set((Array.isArray(d.skills) ? d.skills : []).map((s) => clip(s, 40)).filter(Boolean))).slice(0, MAX_SKILLS);
  const questions = (Array.isArray(d.screeningQuestions) ? d.screeningQuestions : [])
    .map((q) => ({
      id: clip(q?.id, 40) || Math.random().toString(36).slice(2, 10),
      question: clip(q?.question, 200),
      type: q?.type === 'yesno' || q?.type === 'choice' ? q.type : 'text',
      required: !!q?.required,
      ...(q?.type === 'choice' ? { options: cleanOptions(q?.options) } : {}),
      ...(q?.type === 'yesno' && (q?.knockoutAnswer === 'yes' || q?.knockoutAnswer === 'no') ? { knockoutAnswer: q.knockoutAnswer } : {}),
    }))
    .filter((q) => q.question)
    .slice(0, MAX_SCREENING_QUESTIONS);

  const city = clip(d.city, 80);
  const country = clip(d.country, 80);
  // applyVia decides the apply method (older drafts without it fall back to applicationType).
  const via: ApplyVia = APPLY_VIA.some((a) => a.value === d.applyVia) ? d.applyVia
    : d.applicationType === 'EXTERNAL' ? (d.applicationUrl ? 'website' : 'email') : 'udyaibase';
  const external = via !== 'udyaibase';
  const customCategory = d.category === 'OTHER' ? clip(d.categoryLabel, 60) : '';

  return {
    title: clip(d.title, 120),
    category: oneOf(JOB_CATEGORIES, d.category, 'OTHER') as any,
    categoryLabel: customCategory || null,
    department: clip(d.department, 80) || null,
    employmentType: oneOf(EMPLOYMENT_TYPES, d.employmentType, 'FULL_TIME') as any,
    experienceBand: band?.value ?? null,
    experienceMin: band ? band.min : customMin,
    experienceMax: band ? band.max : customMax,
    hiringManagerName: clip(d.hiringManagerName, 80) || null,
    workType: oneOf(WORK_TYPES, d.workType, 'HYBRID') as any,
    city: city || null,
    country: country || null,
    location: jobLocationLabel(d.workType, city, country),
    salaryCurrency: currency,
    salaryPeriod: 'yearly',
    salaryMin,
    salaryMax,
    showSalary: !!d.showSalary,
    hasEsops: !!d.hasEsops,
    equity: d.hasEsops ? 'ESOPs' : null,
    shortDescription: clip(d.shortDescription, 200) || null,
    description: clip(d.description, 20_000),
    skills,
    screeningQuestions: questions,
    applicationType: (external ? 'EXTERNAL' : 'INTERNAL') as any,
    applicationUrl: via === 'website' || via === 'google_form' ? clip(d.applicationUrl, 500) || null : null,
    applicationEmail: via === 'email' ? clip(d.applicationEmail, 200) || null : null,
    expiresAt: closes,
    showOnJobsPage: !!d.showOnJobsPage,
    showOnProfile: !!d.showOnProfile,
    showOnCareers: !!d.showOnCareers,
    mustHaveSkills: (Array.isArray(d.mustHaveSkills) ? d.mustHaveSkills : []).filter((m) => skills.includes(m)),
    maxNoticeDays: ['0', '15', '30', '60', '90'].includes(String(d.maxNoticeDays)) ? Number(d.maxNoticeDays) : null,
    positions: cleanPositions(d.positions),
  };
}

/** The display location saved with a job ("Bengaluru, India", "Remote · India"). */
export function jobLocationLabel(workType: string, city: string | null, country: string | null): string | null {
  return workType === 'REMOTE' ? (country ? `Remote · ${country}` : 'Remote') : [city, country].filter(Boolean).join(', ') || null;
}

/** Field-level reasons a draft can't go live yet. Empty means publishable. */
export function publishProblems(d: JobDraft): { field: keyof JobDraft; message: string }[] {
  const p: { field: keyof JobDraft; message: string }[] = [];
  if (d.title.trim().length < 3) p.push({ field: 'title', message: 'Add a job title.' });
  if (!d.country.trim()) p.push({ field: 'country', message: 'Choose the country for this role.' });
  if (d.workType !== 'REMOTE' && !d.city.trim()) p.push({ field: 'city', message: 'Choose the city for an on-site or hybrid role.' });
  if (d.salaryMin && d.salaryMax && parseFloat(d.salaryMax) < parseFloat(d.salaryMin)) p.push({ field: 'salaryMax', message: 'Maximum salary is lower than the minimum.' });
  if (d.description.trim().length < 100) p.push({ field: 'description', message: 'Write at least a short paragraph about the role (100+ characters).' });
  const via: ApplyVia = d.applyVia ?? (d.applicationType === 'EXTERNAL' ? (d.applicationUrl ? 'website' : 'email') : 'udyaibase');
  const url = (d.applicationUrl ?? '').trim();
  const email = (d.applicationEmail ?? '').trim();
  if (via === 'website') {
    if (!url) p.push({ field: 'applicationUrl', message: 'Add the link to your careers page or job post.' });
    else if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(url)) p.push({ field: 'applicationUrl', message: 'Use a full https:// link.' });
  }
  if (via === 'google_form') {
    if (!url) p.push({ field: 'applicationUrl', message: 'Add the link to your Google Form.' });
    else if (!GOOGLE_FORM_URL.test(url)) p.push({ field: 'applicationUrl', message: 'Use the Google Form’s share link (docs.google.com/forms/… or forms.gle/…).' });
  }
  if (via === 'email') {
    if (!email) p.push({ field: 'applicationEmail', message: 'Add the email address candidates should apply to.' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) p.push({ field: 'applicationEmail', message: 'Enter a valid email.' });
  }
  if (d.experienceBand === CUSTOM_EXPERIENCE) {
    const lo = (d.experienceMin ?? '').trim(); const hi = (d.experienceMax ?? '').trim();
    if (!lo && !hi) p.push({ field: 'experienceMin', message: 'Enter the minimum or maximum years of experience.' });
    else if ([lo, hi].some((v) => v && !/^\d{1,2}$/.test(v))) p.push({ field: 'experienceMin', message: 'Use whole years, like 2 or 6.' });
    else if (lo && hi && Number(hi) < Number(lo)) p.push({ field: 'experienceMax', message: 'Maximum years is lower than the minimum.' });
    else if ([lo, hi].some((v) => v && Number(v) > MAX_EXPERIENCE_YEARS)) p.push({ field: 'experienceMax', message: `Use ${MAX_EXPERIENCE_YEARS} years or less.` });
  }
  if (d.screeningQuestions.some((q) => !q.question.trim())) p.push({ field: 'screeningQuestions', message: 'Fill in or remove empty screening questions.' });
  if (d.screeningQuestions.some((q) => q.type === 'choice' && cleanOptions(q.options).length < 2)) p.push({ field: 'screeningQuestions', message: 'Multiple-choice questions need at least two options.' });
  if (!d.showOnJobsPage && !d.showOnProfile && !d.showOnCareers) p.push({ field: 'showOnJobsPage', message: 'Choose at least one place for this job to appear.' });
  return p;
}

const HYPE = /\b(rockstar|ninja|guru|wizard|superstar|unicorn)\b/i;

export interface StrengthCheck {
  key: string;
  label: string;
  tip: string;
  passed: boolean;
}

/** Deterministic listing-quality score shown next to the preview. No AI involved. */
export function listingStrength(d: JobDraft, opts: { companyHasPerks: boolean }): { score: number; label: 'Weak' | 'Fair' | 'Good' | 'Strong'; checks: StrengthCheck[] } {
  const t = d.title.trim();
  const checks: StrengthCheck[] = [
    { key: 'salary', label: 'Salary shown', tip: 'Jobs with a salary range get noticeably more applicants.', passed: !!d.showSalary && !!(d.salaryMin || d.salaryMax) },
    { key: 'title', label: 'Clear job title', tip: 'Use a standard title like “Backend Engineer”, without hype words or all caps.', passed: t.length >= 5 && t.length <= 60 && !HYPE.test(t) && t !== t.toUpperCase() },
    { key: 'skills', label: 'At least 3 skills', tip: 'Skills power search and show candidates how well they match.', passed: d.skills.length >= 3 },
    { key: 'description', label: 'Detailed description', tip: 'Say what they will do in the first months and who they will work with.', passed: d.description.trim().length >= 600 },
    { key: 'questions', label: '3 or fewer screening questions', tip: 'Every extra question loses applicants.', passed: d.screeningQuestions.length <= MAX_SCREENING_QUESTIONS },
    { key: 'perks', label: 'Company perks listed', tip: 'Add perks like health insurance or learning budget on your company profile.', passed: opts.companyHasPerks || d.hasEsops },
  ];
  const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
  const label = score >= 85 ? 'Strong' : score >= 65 ? 'Good' : score >= 40 ? 'Fair' : 'Weak';
  return { score, label, checks };
}

/** Whole calendar days (India time) from today until `date`; 0 = today, 1 = tomorrow. */
export function daysUntil(date: Date, now = new Date()): number {
  const day = (d: Date) => Date.parse(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  return Math.round((day(date) - day(now)) / 86_400_000);
}

export function formatSalaryDraft(d: Pick<JobDraft, 'salaryCurrency' | 'salaryMin' | 'salaryMax'>): string | null {
  const { symbol, suffix } = salaryUnit(d.salaryCurrency);
  const min = d.salaryMin.trim();
  const max = d.salaryMax.trim();
  if (!min && !max) return null;
  if (min && max && min !== max) return `${symbol}${min}–${max}${suffix} per annum`;
  return `${symbol}${min || max}${suffix} per annum`;
}

export interface JobTemplate {
  key: string;
  label: string;
  draft: Partial<JobDraft>;
}

const section = (about: string, doing: string[], need: string[], nice: string[]) =>
  `## About the role\n${about}\n\n## What you'll do\n${doing.map((x) => `- ${x}`).join('\n')}\n\n## What we're looking for\n${need.map((x) => `- ${x}`).join('\n')}\n\n## Nice to have\n${nice.map((x) => `- ${x}`).join('\n')}`;

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    key: 'founding-engineer',
    label: 'Founding Engineer',
    draft: {
      title: 'Founding Engineer', category: 'AI_ENGINEER', department: 'Engineering', experienceBand: '3-5', hasEsops: true,
      skills: ['TypeScript', 'Python', 'PostgreSQL', 'LLMs'],
      description: section(
        'You will be one of our first engineers and own large parts of the product end to end, from the first customer call to production.',
        ['Ship features across backend, frontend and our AI pipeline every week', 'Talk to customers and turn their problems into product', 'Set up the engineering practices the team will grow on'],
        ['3+ years building and shipping production software', 'Comfort working across the stack', 'Bias to action and clear written communication'],
        ['Experience with LLM APIs, evals or retrieval', 'Prior early-stage startup experience'],
      ),
    },
  },
  {
    key: 'ml-engineer',
    label: 'ML Engineer',
    draft: {
      title: 'Machine Learning Engineer', category: 'ML_ENGINEER', department: 'Engineering', experienceBand: '3-5',
      skills: ['Python', 'PyTorch', 'MLOps', 'SQL'],
      description: section(
        'You will train, evaluate and ship models that run in production for our customers.',
        ['Build training and evaluation pipelines', 'Deploy and monitor models in production', 'Work with product to pick the problems worth solving'],
        ['Hands-on experience shipping ML models to production', 'Strong Python and one deep-learning framework', 'Sound grasp of evaluation and experiment design'],
        ['Experience fine-tuning LLMs', 'Familiarity with GPU infrastructure'],
      ),
    },
  },
  {
    key: 'fullstack',
    label: 'Full-stack Engineer',
    draft: {
      title: 'Full-stack Engineer', category: 'AI_ENGINEER', department: 'Engineering', experienceBand: '1-3',
      skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      description: section(
        'You will build the product our customers use every day, from database to UI.',
        ['Build features end to end in React and Node.js', 'Write tests and review code with the team', 'Improve performance and reliability'],
        ['1+ years building web applications', 'Good knowledge of TypeScript and SQL', 'Care for clean, readable code'],
        ['Experience integrating LLM APIs', 'Design sense'],
      ),
    },
  },
  {
    key: 'product-designer',
    label: 'Product Designer',
    draft: {
      title: 'Product Designer', category: 'AI_DESIGNER', department: 'Design', experienceBand: '3-5',
      skills: ['Figma', 'Prototyping', 'User research', 'Design systems'],
      description: section(
        'You will own the design of our product, from research to polished UI.',
        ['Run user interviews and usability tests', 'Design flows, prototypes and final UI', 'Build and maintain our design system'],
        ['A portfolio of shipped product work', 'Strong interaction and visual design skills', 'Comfort working closely with engineers'],
        ['Experience designing AI-powered products', 'Basic front-end skills'],
      ),
    },
  },
  {
    key: 'data-scientist',
    label: 'Data Scientist',
    draft: {
      title: 'Data Scientist', category: 'DATA_SCIENTIST', department: 'Data', experienceBand: '1-3',
      skills: ['Python', 'SQL', 'Statistics', 'Machine learning'],
      description: section(
        'You will turn our data into decisions and models that improve the product.',
        ['Analyse product and customer data', 'Build and validate predictive models', 'Share findings clearly with the team'],
        ['Strong SQL and Python', 'Solid statistics fundamentals', 'Clear communication of results'],
        ['Experience with experimentation platforms', 'Exposure to LLM-based analytics'],
      ),
    },
  },
];

export const MAX_QUESTION_OPTIONS = 8;
export function cleanOptions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from(new Set(list.map((o) => (typeof o === 'string' ? o.trim().slice(0, 80) : '')).filter(Boolean))).slice(0, MAX_QUESTION_OPTIONS);
}

/** Questions as candidates may see them: never includes the required (knockout) answer. */
export function publicQuestions(raw: unknown): { id: string; question: string; type: 'text' | 'yesno' | 'choice'; required: boolean; options?: string[] }[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((q) => q && typeof q.id === 'string' && typeof q.question === 'string')
    .map((q) => ({
      id: q.id, question: q.question, required: !!q.required,
      type: q.type === 'yesno' || q.type === 'choice' ? q.type : 'text',
      ...(q.type === 'choice' ? { options: cleanOptions(q.options) } : {}),
    }));
}

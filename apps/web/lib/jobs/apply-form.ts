/**
 * What an employer's application form asks. Client-safe. Name, email, resume and consent are always required,
 * because the hiring team and the candidate's status link depend on them.
 */
export const APPLY_FIELDS = [
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'currentTitle', label: 'Current role' },
  { key: 'currentCompany', label: 'Current company' },
  { key: 'experienceYears', label: 'Years of experience' },
  { key: 'noticePeriodDays', label: 'Notice period' },
  { key: 'expectedCtcLakh', label: 'Expected salary' },
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'githubUrl', label: 'GitHub' },
  { key: 'portfolioUrl', label: 'Portfolio' },
  { key: 'coverLetter', label: 'Note to the hiring team' },
] as const;

export type ApplyFieldKey = (typeof APPLY_FIELDS)[number]['key'];
export type FieldMode = 'required' | 'optional' | 'hidden';

export interface ApplyFormConfig {
  fields: Record<ApplyFieldKey, FieldMode>;
  /** Asks "Which of these skills do you have?". The match score needs it, so turning it off is a real trade-off. */
  askSkills: boolean;
  intro: string;
  submitLabel: string;
  successMessage: string;
}

export const DEFAULT_SUBMIT_LABEL = 'Submit application';

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Tolerant by design: old or partial saved values fall back to the defaults, so a form always renders. */
export function parseApplyFormConfig(raw: unknown): ApplyFormConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const given = (r.fields && typeof r.fields === 'object' ? r.fields : {}) as Record<string, unknown>;
  const fields = {} as Record<ApplyFieldKey, FieldMode>;
  for (const { key } of APPLY_FIELDS) {
    const m = given[key];
    fields[key] = m === 'required' || m === 'hidden' ? m : 'optional';
  }
  return {
    fields,
    askSkills: r.askSkills !== false,
    intro: clip(r.intro, 300),
    submitLabel: clip(r.submitLabel, 30) || DEFAULT_SUBMIT_LABEL,
    successMessage: clip(r.successMessage, 300),
  };
}

/** Drops anything the form doesn't ask for, so hidden fields are never stored even if a client sends them. */
export function withoutHiddenFields<T extends Record<string, any>>(form: ApplyFormConfig, body: T): T {
  const out: Record<string, any> = { ...body };
  for (const { key } of APPLY_FIELDS) if (form.fields[key] === 'hidden') delete out[key];
  if (!form.askSkills) delete out.confirmedSkills;
  return out as T;
}

export function requiredFieldErrors(form: ApplyFormConfig, values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { key, label } of APPLY_FIELDS) {
    if (form.fields[key] !== 'required') continue;
    const v = values[key];
    if (v === undefined || v === null || String(v).trim() === '') errors[key] = `${label} is required.`;
  }
  return errors;
}

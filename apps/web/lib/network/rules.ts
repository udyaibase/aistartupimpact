/**
 * "Open to opportunities" (pilot): rules shared by the candidate's page, the companies' page and the server.
 * No server imports.
 *
 * A job seeker chooses to let companies on Udyaibase invite them to apply. Companies see a profile without the
 * person's name, contact details or resume, and send a short request for one open job. Nothing about the person is
 * shared unless they accept and apply through the normal application form.
 */

import { matchSkills, normalizeSkill } from '@/lib/jobs/skills';

/** How long a profile stays visible after turning it on or renewing. */
export const VISIBLE_DAYS = 90;
/** Renewal reminder this many days before it ends. */
export const RENEW_REMINDER_DAYS = 7;
/** Unanswered requests expire after this many days. */
export const REQUEST_EXPIRE_DAYS = 14;
/** A company can ask the same person again only after this many days. */
export const REPEAT_REQUEST_DAYS = 90;
/** Someone with this many unanswered requests is left out of search until they reply. */
export const PENDING_CAP = 5;
export const MESSAGE_MIN = 30;
export const MESSAGE_MAX = 500;
export const MAX_SKILLS = 15;
export const MAX_BLOCKED = 50;

export const WORK_MODES = {
  ANY: 'Open to any',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
  ONSITE: 'On-site',
} as const;
export type WorkMode = keyof typeof WORK_MODES;

/** The consent they agree to, stored with the time they agreed. Change the version when the wording changes. */
export const NETWORK_CONSENT_VERSION = '2026-11-23';
export const NETWORK_CONSENT_TEXT =
  `I agree that companies hiring on Udyaibase can see the profile shown in the preview (not my name, email, phone or resume) and send me requests to apply for their jobs, for ${VISIBLE_DAYS} days. I can pause or leave at any time, which removes my profile.`;

export interface OpenProfileInput {
  headline: string;
  experienceYears: number | null;
  skills: string[];
  city: string | null;
  workMode: WorkMode;
  noticePeriodDays: number | null;
  currentCompany: string | null;
  showCompany: boolean;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const int = (v: unknown, min: number, max: number) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};

/** A profile cleaned for saving: the headline is required, everything else optional. */
export function cleanOpenProfile(raw: unknown): { ok: true; data: OpenProfileInput } | { ok: false; error: string; field: string } {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const headline = text(r.headline, 80);
  if (headline.length < 2) return { ok: false, error: 'Add the kind of role you do, e.g. ML Engineer.', field: 'headline' };
  const skills = Array.from(new Set((Array.isArray(r.skills) ? r.skills : []).map((s) => text(s, 40)).filter(Boolean))).slice(0, MAX_SKILLS);
  const workMode = typeof r.workMode === 'string' && r.workMode in WORK_MODES ? (r.workMode as WorkMode) : 'ANY';
  const currentCompany = text(r.currentCompany, 100) || null;
  return {
    ok: true,
    data: {
      headline,
      experienceYears: int(r.experienceYears, 0, 50),
      skills,
      city: text(r.city, 80) || null,
      workMode,
      noticePeriodDays: int(r.noticePeriodDays, 0, 365),
      currentCompany,
      showCompany: r.showCompany === true && !!currentCompany,
    },
  };
}

/** What a company sees: never a name, email, phone, links or resume. */
export interface NetworkCard {
  id: string;
  headline: string;
  experienceYears: number | null;
  skills: string[];
  city: string | null;
  workMode: WorkMode;
  noticePeriodDays: number | null;
  currentCompany: string | null;
  /** When this company last asked them, if within the repeat window. */
  requestedAt: string | null;
}

export function toNetworkCard(p: {
  id: string; headline: string; experienceYears: number | null; skills: string[]; city: string | null; workMode: string;
  noticePeriodDays: number | null; currentCompany: string | null; showCompany: boolean;
}, requestedAt: Date | null = null): NetworkCard {
  return {
    id: p.id,
    headline: p.headline,
    experienceYears: p.experienceYears,
    skills: p.skills,
    city: p.city,
    workMode: (p.workMode in WORK_MODES ? p.workMode : 'ANY') as WorkMode,
    noticePeriodDays: p.noticePeriodDays,
    currentCompany: p.showCompany ? p.currentCompany : null,
    requestedAt: requestedAt ? requestedAt.toISOString() : null,
  };
}

export const noticeText = (d: number | null) => (d == null ? null : d === 0 ? 'Can join now' : `${d}-day notice`);

/** A request message: long enough to be personal, short enough to read. */
export function cleanIntroMessage(v: unknown): { ok: true; message: string } | { ok: false; error: string } {
  const m = typeof v === 'string' ? v.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n') : '';
  if (m.length < MESSAGE_MIN) return { ok: false, error: `Write a short personal note (at least ${MESSAGE_MIN} characters): why this role, why them.` };
  if (m.length > MESSAGE_MAX) return { ok: false, error: `Keep the note under ${MESSAGE_MAX} characters.` };
  return { ok: true, message: m };
}

export type IntroStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REPORTED';

/** How a request reads to the company. A report reads like a decline: the person isn't exposed for reporting. */
export const INTRO_STATUS_FOR_COMPANY: Record<IntroStatus, string> = {
  PENDING: 'Waiting for a reply',
  ACCEPTED: 'Accepted, applying',
  DECLINED: 'Not interested',
  EXPIRED: 'No reply',
  REPORTED: 'Not interested',
};

/** What a job needs for ranking network profiles against it. */
export interface FitJob { skills: string[]; mustHaveSkills: string[]; experienceMin: number | null; experienceMax: number | null }

/** Same deterministic skill fit as the talent pool, no AI: skills 70, must-haves 20, experience 10. */
export function networkFit(p: { skills: string[]; experienceYears: number | null }, job: FitJob) {
  const matched = matchSkills(job.skills, p.skills).length;
  const have = new Set(p.skills.map(normalizeSkill));
  const mustOk = job.mustHaveSkills.every((s) => have.has(normalizeSkill(s)));
  const expOk = p.experienceYears == null || (job.experienceMin == null && job.experienceMax == null)
    || (p.experienceYears >= (job.experienceMin ?? 0) && (job.experienceMax == null || p.experienceYears <= job.experienceMax + 2));
  const skillPart = job.skills.length ? (matched / job.skills.length) * 70 : 35;
  return Math.min(100, Math.round(skillPart + (mustOk ? 20 : 0) + (expOk ? 10 : 0)));
}

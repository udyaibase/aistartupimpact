/**
 * The hiring pipeline every company shares, so reports compare across jobs and teams. Pure: used by the browser and
 * the server. Steps inside a stage (rounds, assessment) are per job; the stages themselves never change.
 *
 *   New → Screening → [Assessment] → Interview → Final decision → Offer → Hired (awaiting joining → joined)
 *   beside the flow: On hold (keeps the stage it came from) and Not moving ahead (four precise outcomes)
 */

export const STAGES = [
  { key: 'new', label: 'New', statuses: ['APPLIED', 'REVIEWED'], target: 'REVIEWED' },
  { key: 'shortlisted', label: 'Screening', statuses: ['SHORTLISTED'], target: 'SHORTLISTED' },
  { key: 'assessment', label: 'Assessment', statuses: ['ASSESSMENT'], target: 'ASSESSMENT' },
  { key: 'interview', label: 'Interview', statuses: ['INTERVIEW'], target: 'INTERVIEW' },
  { key: 'decision', label: 'Final decision', statuses: ['DECISION'], target: 'DECISION' },
  { key: 'offer', label: 'Offer', statuses: ['OFFER'], target: 'OFFER' },
  { key: 'hired', label: 'Hired', statuses: ['HIRED'], target: 'HIRED' },
] as const;
export const ON_HOLD_STAGE = { key: 'onhold', label: 'On hold', statuses: ['ON_HOLD'], target: 'ON_HOLD' } as const;
export const ENDED_STAGE = { key: 'rejected', label: 'Not moving ahead', statuses: ['REJECTED'], target: 'REJECTED' } as const;

/** Employer-facing name of a status. */
export const STATUS_LABEL: Record<string, string> = {
  APPLIED: 'New', REVIEWED: 'New', SHORTLISTED: 'Screening', ASSESSMENT: 'Assessment', INTERVIEW: 'Interview', DECISION: 'Final decision',
  OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Not moving ahead', ON_HOLD: 'On hold',
};

/** Order of the active stages, for "furthest stage reached" and for spotting a skipped step. */
export const STAGE_RANK: Record<string, number> = {
  APPLIED: 0, REVIEWED: 0, SHORTLISTED: 1, ASSESSMENT: 2, INTERVIEW: 3, DECISION: 4, OFFER: 5, HIRED: 6,
};

// ── How an application ends ────────────────────────────────────────

export const OUTCOMES = ['REJECTED', 'WITHDRAWN', 'OFFER_DECLINED', 'NOT_JOINED'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABEL: Record<Outcome, string> = {
  REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn', OFFER_DECLINED: 'Offer declined', NOT_JOINED: 'Did not join',
};

/** Reasons for the outcomes the candidate drives. Optional; who gave the reason is recorded. */
export const OUTCOME_REASONS: Record<Exclude<Outcome, 'REJECTED'>, readonly string[]> = {
  WITHDRAWN: ['Took another job', 'Not interested any more', 'Salary', 'Location or work mode', 'Personal reasons', 'Stopped responding', 'Other'],
  OFFER_DECLINED: ['Accepted another offer', 'Salary', 'Counter-offer from current employer', 'Role or team', 'Location or work mode', 'Joining date', 'Personal reasons', 'Other'],
  NOT_JOINED: ['Reason unknown', 'Employer cancelled', 'Took another job', 'Counter-offer from current employer', 'Personal reasons', 'Other'],
};

export function outcomeOf(status: string, outcome: string | null | undefined): Outcome | null {
  if (status !== 'REJECTED') return null;
  return (OUTCOMES as readonly string[]).includes(outcome ?? '') ? (outcome as Outcome) : 'REJECTED';
}

/** Hired cards show which of the two they are. */
export function hiredLabel(joinedAt: string | Date | null | undefined): 'Joined' | 'Awaiting joining' {
  return joinedAt ? 'Joined' : 'Awaiting joining';
}

// ── Sourcing ───────────────────────────────────────────────────────

export const SOURCED_STATES = ['ADDED', 'CONTACTED', 'INTERESTED'] as const;
export type SourcedState = (typeof SOURCED_STATES)[number];
/** Channels the team found someone through. "Other" takes a name. */
export const SOURCING_CHANNELS = ['LinkedIn', 'Naukri', 'Instahyre', 'Agency', 'Referral', 'Event', 'College', 'Resume folder', 'Other'] as const;

/** Sourced people not yet interested sit in the sourcing lane, outside the pipeline and its counts. */
export const isSourcedPending = (sourcedState: string | null | undefined) => sourcedState === 'ADDED' || sourcedState === 'CONTACTED';

/** Prisma filter: everyone who is in the pipeline (applicants, and sourced people who said they're interested). */
export const IN_PIPELINE = { AND: [{ OR: [{ sourcedState: null }, { sourcedState: 'INTERESTED' }] }] };

/** "Response overdue" after the answer-by date, unless the employer set a firm expiry (then it expires). */
export function offerState(o: { status: string; answerBy: Date | null; firmExpiry: boolean }, now = new Date()): string {
  if (o.status === 'SENT' && o.answerBy && o.answerBy.getTime() + 432e5 < now.getTime()) return o.firmExpiry ? 'EXPIRED' : 'OVERDUE';
  return o.status;
}

// ── Waiting badges (browser-safe; re-exported by lib/employer/pipeline.ts) ──

/** Still waiting for a decision: the "waiting too long" badge and Top 10 look at these. */
export const UNDECIDED = ['APPLIED', 'REVIEWED'] as const;
/** Stages where a candidate is waiting on the team (badge after 3 and 5 days without a move). */
export const ACTIVE_WAITING = ['APPLIED', 'REVIEWED', 'SHORTLISTED', 'INTERVIEW', 'DECISION', 'OFFER'] as const;
export const WAIT_AMBER_DAYS = 3;
export const WAIT_RED_DAYS = 5;

/** "amber" after 3 days, "red" after 5 days in the same waiting stage; null otherwise. */
export function waitLevel(status: string, since: Date | string | null, now = Date.now()): 'amber' | 'red' | null {
  if (!since || !(ACTIVE_WAITING as readonly string[]).includes(status)) return null;
  const days = (now - new Date(since).getTime()) / 864e5;
  return days >= WAIT_RED_DAYS ? 'red' : days >= WAIT_AMBER_DAYS ? 'amber' : null;
}


// ── Where a candidate came from ────────────────────────────────────

/**
 * The channel to show and report: the stored source, except that applications through a talent-pool invite link
 * (tagged utm_source=talent_pool) count as Talent pool rather than the page they landed on.
 */
export function channelOf(source: string, utmSource: string | null | undefined): string {
  return utmSource === 'talent_pool' ? 'TALENT_POOL' : source;
}
export const CHANNEL_LABEL: Record<string, string> = {
  JOBS_PAGE: 'Udyaibase AI Jobs', STARTUP_PROFILE: 'Startup profile', GOOGLE: 'Google', WIDGET: 'Your website', CAREERS_PAGE: 'Careers page',
  REFERRAL: 'Referral', DIRECT: 'Direct link', OTHER: 'Other', IMPORTED: 'Imported', SOURCED: 'Sourced', TALENT_POOL: 'Talent pool',
};

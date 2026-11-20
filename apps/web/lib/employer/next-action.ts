/**
 * The one line on every active card: what to do next, who should do it, and by when.
 * "Score assignment · Asha · due today". Pure, so the board and tests share it.
 */

export interface NextActionInput {
  status: string;
  sourcedState: string | null;
  sourcedBy: string | null;
  appliedAt: string;
  stageSince: string;
  contactedAt: string | null;
  onHoldUntil: string | null;
  interviewRound: string | null;
  joiningDate: string | null;
  joinedAt: string | null;
  withdrawn: boolean;
  assessment: { status: string; dueAt: string | null; submittedAt: string | null; reviewedAt: string | null; reviewerEmail: string | null } | null;
  offer: { status: string; state: string; answerBy: string | null } | null;
  nextInterview: { round: string; startAt: string } | null;
  pendingFeedback: number;
  /** Owner of the day-to-day steps (recruiter), and of the final decision. */
  recruiter: string | null;
  decisionOwner: string | null;
}

export interface NextAction { text: string; owner: string | null; due: string | null; overdue: boolean }

const DAY = 864e5;
const plus = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();
const name = (email: string | null) => (email ? email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null);

export function nextAction(c: NextActionInput, now = new Date()): NextAction | null {
  if (c.withdrawn || c.status === 'REJECTED') return null;
  const recruiter = name(c.recruiter);
  const decider = name(c.decisionOwner) ?? 'Owners';
  const act = (text: string, owner: string | null, due: string | null): NextAction => ({ text, owner, due, overdue: !!due && new Date(due).getTime() < now.getTime() });

  if (c.sourcedState === 'ADDED') return act('Contact them', name(c.sourcedBy), plus(c.appliedAt, 3));
  if (c.sourcedState === 'CONTACTED') return act('Follow up if no reply', name(c.sourcedBy), plus(c.contactedAt ?? c.appliedAt, 5));

  switch (c.status) {
    case 'APPLIED':
    case 'REVIEWED':
      return act('Review', recruiter, plus(c.appliedAt, 3));
    case 'SHORTLISTED':
      return act('Screening call', recruiter, plus(c.stageSince, 3));
    case 'ASSESSMENT': {
      const a = c.assessment;
      if (!a || a.status === 'CANCELLED') return act('Send assessment', recruiter, plus(c.stageSince, 1));
      const reviewer = name(a.reviewerEmail) ?? recruiter;
      if (a.status === 'SENT') {
        if (a.dueAt && new Date(a.dueAt) < now) return { text: 'Deadline passed: extend or decide', owner: reviewer, due: a.dueAt, overdue: true };
        return { text: 'Waiting for their submission', owner: null, due: a.dueAt, overdue: false };
      }
      if (a.status === 'SUBMITTED') return act('Review and score', reviewer, plus(a.submittedAt ?? c.stageSince, 2));
      return act('Move on or not', reviewer, plus(a.reviewedAt ?? c.stageSince, 1));
    }
    case 'INTERVIEW':
      if (c.pendingFeedback > 0) return act(`Feedback pending (${c.pendingFeedback})`, recruiter, plus(c.stageSince, 1));
      if (c.nextInterview && new Date(c.nextInterview.startAt) > now) {
        return { text: `${c.nextInterview.round} interview`, owner: recruiter, due: c.nextInterview.startAt, overdue: false };
      }
      return act(`Schedule ${c.interviewRound ?? 'interview'}`, recruiter, plus(c.stageSince, 3));
    case 'DECISION':
      return act('Decide', decider, plus(c.stageSince, 2));
    case 'OFFER': {
      const o = c.offer;
      if (!o || o.status === 'DRAFT') return act('Send offer', decider, plus(c.stageSince, 2));
      if (o.state === 'OVERDUE') return { text: 'Response overdue', owner: decider, due: o.answerBy, overdue: true };
      if (o.state === 'EXPIRED' || o.status === 'EXPIRED') return { text: 'Offer expired: decide next step', owner: decider, due: o.answerBy, overdue: true };
      if (o.status === 'SENT') return { text: 'Awaiting their answer', owner: decider, due: o.answerBy, overdue: false };
      return act('Record their answer', decider, null);
    }
    case 'HIRED':
      if (c.joinedAt) return null;
      return { text: c.joiningDate ? 'Joining' : 'Confirm joining date', owner: decider, due: c.joiningDate, overdue: !!c.joiningDate && new Date(c.joiningDate).getTime() + DAY < now.getTime() };
    case 'ON_HOLD':
      if (c.onHoldUntil && new Date(c.onHoldUntil) <= now) return { text: 'Back from hold: resume or contact', owner: recruiter, due: c.onHoldUntil, overdue: true };
      return { text: 'On hold', owner: recruiter, due: c.onHoldUntil, overdue: false };
    default:
      return null;
  }
}

/** "due today", "due in 3 days", "2 days overdue", or a date. */
export function dueLabel(due: string | null, now = new Date()): string | null {
  if (!due) return null;
  const d = new Date(due);
  // Compare India calendar days, not 24-hour spans.
  const dayNo = (x: Date) => Math.floor((x.getTime() + 5.5 * 36e5) / DAY);
  const diff = dayNo(d) - dayNo(now);
  if (diff === 0) return d < now ? 'due today (passed)' : 'due today';
  if (diff < 0) return `${-diff} day${diff === -1 ? '' : 's'} overdue`;
  if (diff === 1) return 'due tomorrow';
  if (diff < 7) return `due in ${diff} days`;
  return `due ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`;
}

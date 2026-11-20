import { prisma } from '@udyaibase/database';
import type { EmployerSession } from '@/lib/employer-auth';
import { employerContext } from '@/lib/employer/applications';
import { moveApplications, type MoveEmail } from '@/lib/employer/pipeline';
import { EXIT_REASONS, ON_HOLD_DEFAULT_DAYS, type ExitReason } from '@/lib/employer/exit-reasons';
import { roundsOf, scorecardSkills } from '@/lib/employer/rounds';
import type { AiScreenResult } from '@/lib/jobs/ai-screen';

/**
 * Final decision: one person decides. Each job names a decision owner (default: the workspace owners) and may name a
 * delegate. Interviewers submit scorecards and recruiters prepare the comparison; only the decision owner or the
 * delegate records Proceed to offer, Reject or Keep as backup, each with a one-line reason. No approval chain.
 */

export const DECISIONS = ['PROCEED', 'REJECT', 'BACKUP'] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_LABEL: Record<Decision, string> = { PROCEED: 'Proceed to offer', REJECT: 'Not moving ahead', BACKUP: 'Keep as backup' };

type DecisionJob = { decisionOwnerEmail: string | null; decisionDelegateEmail: string | null };

/** Who may record the final decision on this job. */
export function canDecide(session: Pick<EmployerSession, 'role' | 'email'>, job: DecisionJob): boolean {
  const me = session.email.toLowerCase();
  if (job.decisionOwnerEmail) return me === job.decisionOwnerEmail.toLowerCase() || me === (job.decisionDelegateEmail ?? '').toLowerCase();
  return session.role === 'OWNER' || me === (job.decisionDelegateEmail ?? '').toLowerCase();
}

/** Who the job shows as the decision owner. */
export function decisionOwnerLabel(job: DecisionJob): string {
  return job.decisionOwnerEmail ?? 'Workspace owners';
}

export async function recordDecision(opts: {
  session: Pick<EmployerSession, 'id' | 'role' | 'email' | 'jobIds'>;
  applicationId: string; decision: unknown; reason: unknown;
  /** Not moving ahead: the internal reject reason, and the email to send (or none). */
  rejectReason?: unknown; email?: MoveEmail | null;
  /** Keep as backup: when to come back to them. */
  holdUntil?: Date | null;
  now?: Date;
}): Promise<{ ok: true; offerId?: string } | { ok: false; error: string; status: number; field?: string }> {
  const now = opts.now ?? new Date();
  const decision = (DECISIONS as readonly string[]).includes(String(opts.decision)) ? (opts.decision as Decision) : null;
  if (!decision) return { ok: false, error: 'Choose a decision.', status: 400, field: 'decision' };
  const reason = typeof opts.reason === 'string' ? opts.reason.trim().replace(/\s+/g, ' ').slice(0, 300) : '';
  if (reason.length < 3) return { ok: false, error: 'Add one line on why, for the record.', status: 400, field: 'reason' };
  const { session } = opts;
  const app = await prisma.jobBoardApplication.findFirst({
    where: { id: opts.applicationId, Listing: { employerId: session.id, ...(session.jobIds ? { id: { in: session.jobIds } } : {}) }, withdrawnAt: null },
    select: { id: true, status: true, Listing: { select: { decisionOwnerEmail: true, decisionDelegateEmail: true, salaryCurrency: true } } },
  });
  if (!app) return { ok: false, error: 'Candidate not found.', status: 404 };
  if (!canDecide(session, app.Listing)) return { ok: false, error: 'Only this job’s decision owner (or their delegate) records the final decision.', status: 403 };
  if (app.status !== 'INTERVIEW' && app.status !== 'DECISION') return { ok: false, error: 'Decide after the interviews: move them to Interview or Final decision first.', status: 409 };

  let rejectReason: ExitReason | null = null;
  if (decision === 'REJECT') {
    rejectReason = EXIT_REASONS.some((r) => r.code === opts.rejectReason) ? (opts.rejectReason as ExitReason) : null;
    if (!rejectReason) return { ok: false, error: 'Choose why they’re not moving ahead.', status: 400, field: 'rejectReason' };
  }

  const ctx = await employerContext(session.id);
  const base = { employerId: session.id, actorEmail: session.email, company: ctx.company, ids: [app.id], batchKey: `decision-${app.id}-${now.getTime()}` };
  await prisma.jobBoardDecision.create({ data: { applicationId: app.id, decision, reason, decidedBy: session.email } });
  if (decision === 'PROCEED') {
    // Proceed to offer opens a draft: the team still decides what to offer, so nothing is emailed yet.
    // Recorded as a decision (not a skipped step), including the one-click shortcut from the last interview.
    await moveApplications({ ...base, toStatus: 'OFFER', email: null, reason: 'DECISION_PROCEED' });
    const existing = await prisma.jobBoardOffer.findFirst({ where: { applicationId: app.id, status: { in: ['DRAFT', 'SENT'] } }, select: { id: true } });
    const offer = existing ?? await prisma.jobBoardOffer.create({
      data: { applicationId: app.id, employerId: session.id, currency: app.Listing.salaryCurrency ?? 'INR', createdByEmail: session.email },
      select: { id: true },
    });
    return { ok: true, offerId: offer.id };
  }
  if (decision === 'REJECT') {
    await moveApplications({ ...base, toStatus: 'REJECTED', reason: rejectReason, note: reason, email: opts.email ?? null, outcome: 'REJECTED' });
    return { ok: true };
  }
  const until = opts.holdUntil ?? new Date(now.getTime() + ON_HOLD_DEFAULT_DAYS * 864e5);
  await moveApplications({ ...base, toStatus: 'ON_HOLD', note: reason, holdUntil: until, email: null });
  return { ok: true };
}

// ── Comparing finalists ────────────────────────────────────────────

export interface RoundCards { round: string; cards: { author: string; recommendation: 'YES' | 'NO'; ratings: Record<string, number> }[]; pending: string[] }

/**
 * Interviewers disagree on a round when their yes/no answers conflict, or their ratings for one skill are 2 or more
 * apart (on the 1–4 scale we collect).
 */
export function disagreement(cards: RoundCards['cards']): { conflict: boolean; skills: string[] } {
  const recs = new Set(cards.map((c) => c.recommendation));
  const skills = new Set(cards.flatMap((c) => Object.keys(c.ratings)));
  const split = Array.from(skills).filter((s) => {
    const v = cards.map((c) => c.ratings[s]).filter((n): n is number => typeof n === 'number');
    return v.length >= 2 && Math.max(...v) - Math.min(...v) >= 2;
  });
  return { conflict: recs.size > 1 || split.length > 0, skills: split };
}

export interface Finalist {
  id: string; fullName: string; status: string; currentTitle: string | null; currentCompany: string | null;
  mustHaves: { skill: string; met: boolean }[];
  assessment: { score: number | null; maxScore: number | null; passMark: number | null; status: string; kind: string } | null;
  rounds: (RoundCards & { disagreement: { conflict: boolean; skills: string[] } })[];
  ai: { fitScore: number | null; strengths: string[]; gaps: string[] } | null;
  salaryAskLakh: number | null; noticePeriodDays: number | null;
  lastDecision: { decision: string; reason: string; by: string; at: string } | null;
}

/**
 * Finalists side by side, evidence first: must-haves, assessment work, each round's scorecards (with missing ones as
 * "Feedback pending" and disagreements flagged), AI strengths and gaps, salary asked against the band, notice period.
 * Source is left out on purpose: it's for reports, not for deciding between people.
 */
export async function loadFinalists(employerId: string, listingId: string, jobIds: string[] | null, ids?: string[]) {
  const job = await prisma.jobBoardListing.findFirst({
    where: { id: listingId, employerId, deletedAt: null, ...(jobIds ? { id: { in: jobIds } } : {}) },
    select: { id: true, title: true, skills: true, mustHaveSkills: true, interviewRounds: true, salaryMin: true, salaryMax: true, salaryCurrency: true, decisionOwnerEmail: true, decisionDelegateEmail: true },
  });
  if (!job) return null;
  const apps = await prisma.jobBoardApplication.findMany({
    where: { listingId, withdrawnAt: null, ...(ids?.length ? { id: { in: ids.slice(0, 8) } } : { status: 'DECISION' }) },
    orderBy: { statusChangedAt: 'asc' },
    take: 8,
    select: {
      id: true, fullName: true, status: true, currentTitle: true, currentCompany: true, matchedSkills: true, confirmedSkills: true, expectedCtcLakh: true, noticePeriodDays: true,
      AiScreening: { select: { status: true, fitScore: true, result: true } },
      Scorecards: { select: { round: true, authorName: true, authorEmail: true, recommendation: true, ratings: true } },
      Interviews: { where: { status: 'SCHEDULED' }, select: { round: true, panelEmails: true, startAt: true } },
      Assessments: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { score: true, maxScore: true, passMark: true, status: true, kind: true } },
      Decisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { decision: true, reason: true, decidedBy: true, createdAt: true } },
    },
  });
  const rounds = roundsOf(job.interviewRounds);
  const must = job.mustHaveSkills.length ? job.mustHaveSkills : scorecardSkills(job).slice(0, 3);
  const now = Date.now();
  const finalists: Finalist[] = apps.map((a) => {
    const has = new Set([...a.matchedSkills, ...a.confirmedSkills].map((s) => s.toLowerCase()));
    const r = a.AiScreening?.status === 'DONE' ? (a.AiScreening.result as AiScreenResult | null) : null;
    return {
      id: a.id, fullName: a.fullName, status: a.status, currentTitle: a.currentTitle, currentCompany: a.currentCompany,
      mustHaves: must.map((skill) => ({ skill, met: has.has(skill.toLowerCase()) })),
      assessment: a.Assessments[0] ? { ...a.Assessments[0] } : null,
      rounds: rounds.map((round) => {
        const cards = a.Scorecards.filter((s) => s.round === round).map((s) => ({ author: s.authorName, recommendation: s.recommendation as 'YES' | 'NO', ratings: s.ratings as Record<string, number> }));
        // Panel members of a past interview for this round who haven't sent a scorecard yet.
        const done = new Set(a.Scorecards.filter((s) => s.round === round).map((s) => s.authorEmail.toLowerCase()));
        const pending = Array.from(new Set(a.Interviews.filter((i) => i.round === round && i.startAt.getTime() < now).flatMap((i) => i.panelEmails.map((e) => e.toLowerCase()))))
          .filter((e) => !done.has(e));
        return { round, cards, pending, disagreement: disagreement(cards) };
      }),
      ai: r ? { fitScore: a.AiScreening?.fitScore ?? null, strengths: (r.strengths ?? []).slice(0, 3).map((s) => s.point), gaps: (r.gaps ?? []).slice(0, 3) } : null,
      salaryAskLakh: a.expectedCtcLakh, noticePeriodDays: a.noticePeriodDays,
      lastDecision: a.Decisions[0] ? { decision: a.Decisions[0].decision, reason: a.Decisions[0].reason, by: a.Decisions[0].decidedBy, at: a.Decisions[0].createdAt.toISOString() } : null,
    };
  });
  const band = (job.salaryCurrency ?? 'INR') === 'INR' && (job.salaryMin || job.salaryMax)
    ? { minLakh: job.salaryMin ? job.salaryMin / 100_000 : null, maxLakh: job.salaryMax ? job.salaryMax / 100_000 : null } : null;
  return { job: { id: job.id, title: job.title, rounds, band, decisionOwner: decisionOwnerLabel(job) }, finalists };
}

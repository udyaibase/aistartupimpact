import { prisma, Prisma } from '@udyaibase/database';
import type { EmployerSession } from '@/lib/employer-auth';
import { employerContext } from '@/lib/employer/applications';
import { moveApplications, type MoveResult } from '@/lib/employer/pipeline';
import { canDecide } from '@/lib/employer/decisions';
import { closeFilledJobs, hiresByJob, openingsOf, type Openings } from '@/lib/employer/job-stages';
import { OUTCOME_REASONS, offerState, type Outcome } from '@/lib/employer/stages';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';

/**
 * Offer to joining, without letters or approvals. The team records the offer (amount against the band, joining date,
 * answer-by date); the candidate's answer moves them on:
 *   Proceed to offer → Offer sent → Accepted · Awaiting joining (reserves an opening) → Joined (fills it)
 * Declined, expired or did-not-join release the opening. Amounts are visible to owners and the decision owner
 * (recruiters only when the job allows it; interviewers never).
 */

const DAY = 864e5;
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
type Session = Pick<EmployerSession, 'id' | 'role' | 'email' | 'jobIds'>;
type OfferJob = { decisionOwnerEmail: string | null; decisionDelegateEmail: string | null; recruitersSeeOffers: boolean };

export function canSeeAmounts(session: Pick<Session, 'role' | 'email'>, job: OfferJob): boolean {
  if (session.role === 'INTERVIEWER') return false;
  if (session.role === 'OWNER' || canDecide(session, job)) return true;
  return session.role === 'RECRUITER' && job.recruitersSeeOffers;
}

export { offerState };

const JOB_SELECT = { id: true, positions: true, title: true, decisionOwnerEmail: true, decisionDelegateEmail: true, recruitersSeeOffers: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true } as const;

async function findApp(session: Session, applicationId: string) {
  return prisma.jobBoardApplication.findFirst({
    where: { id: applicationId, Listing: { employerId: session.id, ...(session.jobIds ? { id: { in: session.jobIds } } : {}) } },
    select: { id: true, status: true, fullName: true, email: true, joinedAt: true, joiningDate: true, withdrawnAt: true, listingId: true, Listing: { select: JOB_SELECT } },
  });
}

export async function openingsFor(listingId: string, positions: number): Promise<Openings & { outstanding: number }> {
  const [hires, outstanding] = await Promise.all([
    hiresByJob([listingId]),
    prisma.jobBoardOffer.count({ where: { status: 'SENT', Application: { listingId, status: 'OFFER', withdrawnAt: null } } }),
  ]);
  const h = hires[listingId] ?? { joined: 0, awaiting: 0 };
  return { ...openingsOf(positions, h.joined, h.awaiting), outstanding };
}

/** The candidate's offers and the job's openings, amounts hidden from people who may not see them. */
export async function loadOffers(session: Session, applicationId: string, now = new Date()) {
  const app = await findApp(session, applicationId);
  if (!app) return null;
  const amounts = canSeeAmounts(session, app.Listing);
  const rows = await prisma.jobBoardOffer.findMany({ where: { applicationId }, orderBy: { createdAt: 'desc' }, take: 10 });
  // A firm expiry that passed is recorded as expired the first time anyone looks.
  for (const o of rows) {
    if (offerState(o, now) === 'EXPIRED' && o.status === 'SENT') {
      await prisma.jobBoardOffer.update({ where: { id: o.id }, data: { status: 'EXPIRED' } });
      o.status = 'EXPIRED';
    }
  }
  return {
    canSeeAmounts: amounts,
    canDecide: canDecide(session, app.Listing),
    openings: await openingsFor(app.listingId, app.Listing.positions),
    band: amounts && app.Listing.salaryPeriod !== 'monthly' && (app.Listing.salaryMin || app.Listing.salaryMax) ? { min: app.Listing.salaryMin, max: app.Listing.salaryMax, currency: app.Listing.salaryCurrency ?? 'INR' } : null,
    hire: app.status === 'HIRED' ? { joiningDate: app.joiningDate?.toISOString() ?? null, joinedAt: app.joinedAt?.toISOString() ?? null } : null,
    offers: rows.map((o) => ({
      id: o.id, status: o.status, state: offerState(o, now), currency: o.currency,
      fixedAnnual: amounts ? o.fixedAnnual : null, variableAnnual: amounts ? o.variableAnnual : null,
      revisions: amounts ? (o.revisions as unknown[]) : [],
      joiningDate: o.joiningDate?.toISOString() ?? null, answerBy: o.answerBy?.toISOString() ?? null, firmExpiry: o.firmExpiry,
      notes: amounts ? o.notes : null, sentAt: o.sentAt?.toISOString() ?? null, respondedAt: o.respondedAt?.toISOString() ?? null,
      declineReason: o.declineReason, reasonBy: o.reasonBy, createdByEmail: o.createdByEmail,
    })),
  };
}

const dateOnly = (v: unknown): Date | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const money = (v: unknown): number | null | 'bad' => {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : 'bad';
};

export interface OfferInput { fixedAnnual?: unknown; variableAnnual?: unknown; joiningDate?: unknown; answerBy?: unknown; firmExpiry?: unknown; notes?: unknown }

/** Creates or edits the open offer. A change to the amounts after it was sent is kept as a revision. */
export async function saveOffer(session: Session, applicationId: string, input: OfferInput, now = new Date()):
  Promise<{ ok: true; id: string } | { ok: false; error: string; status: number; field?: string }> {
  const app = await findApp(session, applicationId);
  if (!app || app.withdrawnAt) return { ok: false, error: 'Candidate not found.', status: 404 };
  if (app.status !== 'OFFER') return { ok: false, error: 'Move them to Offer first (Proceed to offer).', status: 409 };
  if (!canSeeAmounts(session, app.Listing)) return { ok: false, error: 'Only owners and the decision owner can set offer amounts on this job.', status: 403 };
  const fixed = money(input.fixedAnnual);
  if (fixed === 'bad' || (fixed != null && fixed < 10_000)) return { ok: false, error: 'Enter the yearly fixed pay.', status: 400, field: 'fixedAnnual' };
  const variable = money(input.variableAnnual);
  if (variable === 'bad') return { ok: false, error: 'Variable pay looks wrong.', status: 400, field: 'variableAnnual' };
  const joiningDate = input.joiningDate ? dateOnly(input.joiningDate) : null;
  if (input.joiningDate && (!joiningDate || joiningDate.getTime() < now.getTime() - 30 * DAY)) return { ok: false, error: 'Pick a valid joining date.', status: 400, field: 'joiningDate' };
  const answerBy = input.answerBy ? dateOnly(input.answerBy) : null;
  if (input.answerBy && !answerBy) return { ok: false, error: 'Pick a valid answer-by date.', status: 400, field: 'answerBy' };
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) || null : null;
  const data = { fixedAnnual: fixed, variableAnnual: variable, joiningDate, answerBy, firmExpiry: input.firmExpiry === true && !!answerBy, notes };

  const open = await prisma.jobBoardOffer.findFirst({ where: { applicationId, status: { in: ['DRAFT', 'SENT'] } }, orderBy: { createdAt: 'desc' } });
  if (!open) {
    const o = await prisma.jobBoardOffer.create({ data: { applicationId, employerId: session.id, currency: app.Listing.salaryCurrency ?? 'INR', createdByEmail: session.email, ...data }, select: { id: true } });
    return { ok: true, id: o.id };
  }
  const changed = open.status === 'SENT' && (open.fixedAnnual !== fixed || open.variableAnnual !== variable || (open.joiningDate?.getTime() ?? 0) !== (joiningDate?.getTime() ?? 0));
  const revisions = changed
    ? [...((open.revisions as unknown[]) ?? []), { at: now.toISOString(), by: session.email, fixedAnnual: open.fixedAnnual, variableAnnual: open.variableAnnual, joiningDate: open.joiningDate?.toISOString() ?? null }]
    : (open.revisions as unknown[]);
  await prisma.jobBoardOffer.update({ where: { id: open.id }, data: { ...data, revisions: revisions as Prisma.InputJsonValue } });
  return { ok: true, id: open.id };
}

/**
 * Records that the offer went out (the team sends it in their own words). Warns first when it would promise more
 * people than there are openings: joined + awaiting joining + other offers still out.
 */
export async function sendOffer(session: Session, applicationId: string, opts: { confirmOvercommit?: boolean } = {}, now = new Date()):
  Promise<{ ok: true } | { ok: false; error: string; status: number; warning?: { positions: number; committed: number } }> {
  const app = await findApp(session, applicationId);
  if (!app || app.withdrawnAt) return { ok: false, error: 'Candidate not found.', status: 404 };
  if (!canSeeAmounts(session, app.Listing)) return { ok: false, error: 'Only owners and the decision owner can send offers on this job.', status: 403 };
  const open = await prisma.jobBoardOffer.findFirst({ where: { applicationId, status: 'DRAFT' }, orderBy: { createdAt: 'desc' } });
  if (!open) return { ok: false, error: 'There’s no draft offer to send.', status: 409 };
  if (!open.fixedAnnual) return { ok: false, error: 'Add the yearly fixed pay first.', status: 400 };
  const o = await openingsFor(app.listingId, app.Listing.positions);
  const committed = o.joined + o.awaiting + o.outstanding;
  if (committed >= o.positions && !opts.confirmOvercommit) {
    return { ok: false, error: `${committed} of ${o.positions} opening${o.positions === 1 ? ' is' : 's are'} already taken or offered. Send anyway?`, status: 409, warning: { positions: o.positions, committed } };
  }
  await prisma.jobBoardOffer.update({ where: { id: open.id }, data: { status: 'SENT', sentAt: now } });
  return { ok: true };
}

export async function withdrawOffer(session: Session, applicationId: string): Promise<boolean> {
  const app = await findApp(session, applicationId);
  if (!app || !canSeeAmounts(session, app.Listing)) return false;
  const r = await prisma.jobBoardOffer.updateMany({ where: { applicationId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'WITHDRAWN' } });
  return r.count > 0;
}

const cleanReason = (outcome: Exclude<Outcome, 'REJECTED'>, reason: unknown): string | null =>
  typeof reason === 'string' && (OUTCOME_REASONS[outcome] as readonly string[]).includes(reason) ? reason : null;

/** The candidate's answer: accepted reserves an opening (Hired · awaiting joining); declined ends the application. */
export async function recordOfferAnswer(session: Session, applicationId: string, input: { answer?: unknown; reason?: unknown; reasonBy?: unknown; note?: unknown; joiningDate?: unknown }, now = new Date()):
  Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const app = await findApp(session, applicationId);
  if (!app || app.withdrawnAt) return { ok: false, error: 'Candidate not found.', status: 404 };
  if (app.status !== 'OFFER') return { ok: false, error: 'They’re not at the offer stage.', status: 409 };
  const offer = await prisma.jobBoardOffer.findFirst({ where: { applicationId, status: { in: ['SENT', 'DRAFT', 'EXPIRED'] } }, orderBy: { createdAt: 'desc' } });
  const ctx = await employerContext(session.id);
  const base = { employerId: session.id, actorEmail: session.email, company: ctx.company, ids: [app.id], batchKey: `offer-answer-${app.id}-${now.getTime()}`, email: null };
  if (input.answer === 'ACCEPTED') {
    const joiningDate = (input.joiningDate ? dateOnly(input.joiningDate) : null) ?? offer?.joiningDate ?? null;
    if (offer) await prisma.jobBoardOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', respondedAt: now, joiningDate } });
    await moveApplications({ ...base, toStatus: 'HIRED', joiningDate, joined: false });
    return { ok: true };
  }
  if (input.answer === 'DECLINED') {
    const reason = cleanReason('OFFER_DECLINED', input.reason);
    const reasonBy = reason ? (input.reasonBy === 'TEAM' ? 'TEAM' : 'CANDIDATE') : null;
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 300) || null : null;
    if (offer) await prisma.jobBoardOffer.update({ where: { id: offer.id }, data: { status: 'DECLINED', respondedAt: now, declineReason: reason, reasonBy } });
    await moveApplications({ ...base, toStatus: 'REJECTED', outcome: 'OFFER_DECLINED', reason: null, note: [reason, note].filter(Boolean).join(': ') || null });
    if (reasonBy) await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { outcomeReasonBy: reasonBy } });
    return { ok: true };
  }
  return { ok: false, error: 'Choose accepted or declined.', status: 400 };
}

/** They started: fills an opening. The last opening joined closes the job as filled (closing emails are a choice). */
export async function markJoined(session: Session, applicationId: string, now = new Date()): Promise<{ ok: true; filledJobs: MoveResult['filledJobs'] } | { ok: false; error: string; status: number }> {
  const app = await findApp(session, applicationId);
  if (!app || app.status !== 'HIRED') return { ok: false, error: 'Only accepted candidates can be marked as joined.', status: 409 };
  if (app.joinedAt) return { ok: false, error: 'Already marked as joined.', status: 409 };
  await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { joinedAt: now } });
  await prisma.jobBoardApplicationEvent.create({ data: { applicationId: app.id, fromStatus: 'HIRED', toStatus: 'HIRED', actorEmail: session.email, reasonCode: 'JOINED' } });
  return { ok: true, filledJobs: await closeFilledJobs([app.listingId], session.email) };
}

/** Accepted but didn't join: the opening is released and the job's backups are shown for a person to decide. */
export async function markNotJoined(session: Session, applicationId: string, input: { reason?: unknown; reasonBy?: unknown }, now = new Date()):
  Promise<{ ok: true; backups: { id: string; fullName: string; status: string }[] } | { ok: false; error: string; status: number }> {
  const app = await findApp(session, applicationId);
  if (!app || app.status !== 'HIRED' || app.joinedAt) return { ok: false, error: 'Only someone awaiting joining can be marked as not joined.', status: 409 };
  const reason = cleanReason('NOT_JOINED', input.reason) ?? 'Reason unknown';
  // "Employer cancelled" is the team's reason; the rest come from the candidate unless said otherwise.
  const reasonBy = reason === 'Employer cancelled' || reason === 'Reason unknown' || input.reasonBy === 'TEAM' ? 'TEAM' : 'CANDIDATE';
  const ctx = await employerContext(session.id);
  await moveApplications({ employerId: session.id, actorEmail: session.email, company: ctx.company, ids: [app.id], toStatus: 'REJECTED', outcome: 'NOT_JOINED', reasonBy, note: reason, batchKey: `not-joined-${app.id}-${now.getTime()}`, email: null });
  await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { outcomeReasonBy: reasonBy } });
  const backups = await prisma.jobBoardApplication.findMany({
    where: { listingId: app.listingId, withdrawnAt: null, status: { in: ['ON_HOLD', 'DECISION'] }, id: { not: app.id } },
    orderBy: { statusChangedAt: 'desc' }, take: 10, select: { id: true, fullName: true, status: true },
  });
  return { ok: true, backups };
}

/** The team records that a candidate withdrew (from any active stage). The reason is optional; who gave it is kept. */
export async function recordWithdrawal(session: Session, applicationId: string, input: { reason?: unknown; reasonBy?: unknown }, now = new Date()):
  Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const app = await findApp(session, applicationId);
  if (!app || app.withdrawnAt) return { ok: false, error: 'Candidate not found.', status: 404 };
  if (app.status === 'REJECTED') return { ok: false, error: 'This application has already ended.', status: 409 };
  const reason = cleanReason('WITHDRAWN', input.reason);
  const reasonBy = reason ? (input.reasonBy === 'TEAM' ? 'TEAM' : 'CANDIDATE') : null;
  const ctx = await employerContext(session.id);
  await prisma.jobBoardOffer.updateMany({ where: { applicationId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'WITHDRAWN' } });
  await moveApplications({ employerId: session.id, actorEmail: session.email, company: ctx.company, ids: [app.id], toStatus: 'REJECTED', outcome: 'WITHDRAWN', reasonBy, note: reason, batchKey: `withdrawn-${app.id}-${now.getTime()}`, email: null });
  if (reasonBy) await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { outcomeReasonBy: reasonBy } });
  return { ok: true };
}

/** Daily: expire firm offers past their date, and remind the team a week before someone joins. */
export async function offerMaintenance(now = new Date()): Promise<{ expired: number; joiningReminders: number }> {
  const expired = await prisma.jobBoardOffer.updateMany({ where: { status: 'SENT', firmExpiry: true, answerBy: { lt: new Date(now.getTime() - DAY / 2) } }, data: { status: 'EXPIRED' } });
  const soon = await prisma.jobBoardApplication.findMany({
    where: { status: 'HIRED', joinedAt: null, withdrawnAt: null, joiningDate: { gte: new Date(now.getTime() + 6 * DAY), lt: new Date(now.getTime() + 7 * DAY) } },
    select: { id: true, fullName: true, joiningDate: true, Listing: { select: { title: true, publishedByEmail: true, decisionOwnerEmail: true, Employer: { select: { email: true } } } } },
    take: 200,
  });
  for (const a of soon) {
    const to = a.Listing.decisionOwnerEmail || a.Listing.publishedByEmail || a.Listing.Employer.email;
    if (!to || to.endsWith('.invalid')) continue;
    const when = a.joiningDate!.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
    sendEmailFireAndForget({
      to, type: 'joining_reminder',
      subject: `${a.fullName} joins as ${a.Listing.title} on ${when}`.replace(/[\r\n]+/g, ' '),
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">${esc(a.fullName)} joins in a week</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(a.fullName)} accepted the <strong>${esc(a.Listing.title)}</strong> offer and joins on <strong>${esc(when)}</strong>. A quick check-in now helps them stay committed through their notice period.</p>
<p style="margin:0">${button(`${SITE()}/employer/applications?candidate=${a.id}`, 'Open the candidate')}</p>`),
    });
  }
  return { expired: expired.count, joiningReminders: soon.length };
}

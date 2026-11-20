import crypto from 'node:crypto';
import { prisma, Prisma } from '@udyaibase/database';
import type { EmployerSession } from '@/lib/employer-auth';
import { sendEmail, sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { employerContext } from '@/lib/employer/applications';
import { moveApplications, type MoveEmail } from '@/lib/employer/pipeline';
import { EXIT_REASONS, type ExitReason } from '@/lib/employer/exit-reasons';
import { putResume, resumeStorageReady } from '@/lib/jobs/resume-storage';
import { MAX_RESUME_BYTES, sniffResume } from '@/lib/jobs/resume-text';
import { cleanAssessmentConfig, HAS_CANDIDATE_PAGE, KIND_LABEL, LIMITS, rubricTotal, type AssessmentConfig, type RubricCriterion } from '@/lib/employer/assessment-config';

/**
 * Assessments, optional per job (see lib/employer/assessment-config.ts for the five kinds, rubrics and the library).
 * Every kind except a live exercise gets a private candidate page to hand in work, answer questions or say they're
 * done. The pass mark only highlights; a person always records Move on or Not moving ahead. A missed deadline flags
 * the reviewer, who can extend it or allow a resubmission; nothing is rejected automatically.
 */

export { ASSESSMENT_KINDS, KIND_LABEL, cleanAssessmentConfig, type AssessmentConfig, type AssessmentKind } from '@/lib/employer/assessment-config';

const DAY = 864e5;
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
type Session = Pick<EmployerSession, 'id' | 'role' | 'email' | 'jobIds'>;

/** A job's stored setup, read leniently (an older setup never disappears because a rule got stricter). */
export const configOf = (v: Prisma.JsonValue | null | undefined): AssessmentConfig | null => {
  const r = cleanAssessmentConfig(v ?? null);
  return r.ok ? r.config : null;
};

const linkOk = (s: string) => /^https:\/\/[^\s]+\.[^\s]+$/.test(s) && s.length <= 500;
const rubricOf = (v: Prisma.JsonValue | null | undefined): RubricCriterion[] => (Array.isArray(v) ? (v as unknown as RubricCriterion[]).filter((c) => c && typeof c.name === 'string') : []);
const questionsOf = (v: Prisma.JsonValue | null | undefined): string[] => (Array.isArray(v) ? (v as unknown[]).filter((q): q is string => typeof q === 'string') : []);

/** Overdue: still waiting for the candidate after the deadline. */
export const isOverdue = (a: { status: string; dueAt: Date | null }, now = new Date()) => a.status === 'SENT' && !!a.dueAt && a.dueAt < now;
/** Advisory pass/fail against the pass mark (null when there's no mark or score). */
export const meetsPassMark = (a: { score: number | null; passMark: number | null }) => (a.score == null || a.passMark == null ? null : a.score >= a.passMark);

async function findApp(session: Session, applicationId: string) {
  return prisma.jobBoardApplication.findFirst({
    where: { id: applicationId, Listing: { employerId: session.id, ...(session.jobIds ? { id: { in: session.jobIds } } : {}) }, withdrawnAt: null },
    select: { id: true, status: true, fullName: true, email: true, listingId: true, Listing: { select: { title: true, assessment: true } } },
  });
}

/**
 * Sends the job's assessment to a candidate and moves them to the Assessment stage. `deadlineDays` and a personal
 * `note` can be set for this one candidate (e.g. more time for someone serving notice).
 */
export async function sendAssessment(session: Session, applicationId: string, opts: { deadlineDays?: unknown; note?: unknown } = {}, now = new Date()):
  Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const app = await findApp(session, applicationId);
  if (!app) return { ok: false, error: 'Candidate not found.', status: 404 };
  const cfg = configOf(app.Listing.assessment);
  if (!cfg) return { ok: false, error: 'This job has no assessment. Turn one on in the job’s pipeline settings.', status: 409 };
  if (['REJECTED', 'HIRED', 'OFFER'].includes(app.status)) return { ok: false, error: 'Move them back into the pipeline first.', status: 409 };
  const open = await prisma.jobBoardAssessment.findFirst({ where: { applicationId, status: { in: ['SENT', 'SUBMITTED'] } }, select: { id: true } });
  if (open) return { ok: false, error: 'They already have an open assessment.', status: 409 };
  const days = opts.deadlineDays == null || opts.deadlineDays === '' ? cfg.deadlineDays : Math.round(Number(opts.deadlineDays));
  if (!Number.isFinite(days) || days < 1 || days > 14) return { ok: false, error: 'Give them between 1 and 14 days.', status: 400 };
  const note = typeof opts.note === 'string' ? opts.note.trim().slice(0, 1000) : '';

  const page = HAS_CANDIDATE_PAGE.includes(cfg.kind);
  const token = page ? crypto.randomBytes(24).toString('base64url') : null;
  const dueAt = cfg.kind === 'LIVE' ? null : new Date(now.getTime() + days * DAY);
  const a = await prisma.jobBoardAssessment.create({
    data: {
      applicationId, kind: cfg.kind, title: cfg.title, brief: cfg.brief || null, url: cfg.url, dueAt, maxScore: cfg.maxScore, passMark: cfg.passMark,
      questions: cfg.questions.length ? (cfg.questions as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      rubric: cfg.rubric.length ? (cfg.rubric as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      tokenHash: token ? hash(token) : null, createdByEmail: session.email, reviewerEmail: session.email,
    },
    select: { id: true },
  });
  const ctx = await employerContext(session.id);
  if (app.status !== 'ASSESSMENT') {
    await moveApplications({ employerId: session.id, actorEmail: session.email, company: ctx.company, ids: [app.id], toStatus: 'ASSESSMENT', email: null, batchKey: `assessment-${a.id}` });
  }
  if (page) {
    const first = app.fullName.split(' ')[0] || app.fullName;
    const due = dueAt!.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
    const what = { TAKE_HOME: 'an assignment', QUESTIONS: 'a few written questions', WORK_SAMPLE: 'some of your past work', EXTERNAL: 'an online test', LIVE: '' }[cfg.kind];
    const cta = { TAKE_HOME: 'Open the assignment', QUESTIONS: 'Answer the questions', WORK_SAMPLE: 'Share your work', EXTERNAL: 'See the test', LIVE: '' }[cfg.kind];
    await sendEmail({
      to: app.email, replyTo: session.email, type: 'assessment_sent',
      subject: `Next step for ${app.Listing.title} at ${ctx.company}: ${cfg.title}`.replace(/[\r\n]+/g, ' '),
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Hi ${esc(first)}, here’s your next step</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">For the <strong>${esc(app.Listing.title)}</strong> role we’d like to see ${what}: <strong>${esc(cfg.title)}</strong>. Please finish by <strong>${esc(due)} IST</strong>.</p>
${note ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(note)}</p>` : ''}
<p style="margin:0 0 20px">${button(`${SITE()}/assessment/${token}`, cta)}</p>
<p style="margin:0;font-size:13px;color:#6b7280">The page has everything you need. Need more time? Reply to this email.</p>`),
    });
  }
  return { ok: true, id: a.id };
}

/** For the candidate's page. */
export async function assessmentByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.jobBoardAssessment.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, kind: true, title: true, status: true, brief: true, url: true, dueAt: true, submittedAt: true, submissionUrl: true, submissionLinks: true, questions: true, Application: { select: { fullName: true, withdrawnAt: true, Listing: { select: { title: true } } } } },
  });
}

/**
 * The candidate hands in their work, by kind: links and/or a PDF or Word file (assignments, work samples), answers
 * to every question (questions), or "I've finished" with an optional link (online test). Closed after the deadline.
 */
export async function submitAssessment(token: string, input: { links?: unknown; url?: unknown; note?: unknown; file?: Uint8Array | null; answers?: unknown }, now = new Date()):
  Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const a = await assessmentByToken(token);
  if (!a || a.Application.withdrawnAt) return { ok: false, error: 'This link no longer works.', status: 404 };
  if (a.status !== 'SENT') return { ok: false, error: a.status === 'SUBMITTED' ? 'You’ve already submitted. The team will be in touch.' : 'This assessment is closed.', status: 409 };
  if (a.dueAt && a.dueAt < now) return { ok: false, error: 'The deadline has passed. Reply to the team’s email to ask for more time.', status: 409 };

  const rawLinks = [...(Array.isArray(input.links) ? input.links : []), input.url].filter((l): l is string => typeof l === 'string' && !!l.trim()).map((l) => l.trim());
  if (rawLinks.some((l) => !linkOk(l))) return { ok: false, error: 'Links must start with https://', status: 400 };
  const links = Array.from(new Set(rawLinks)).slice(0, LIMITS.links);

  let answers: string[] | null = null;
  if (a.kind === 'QUESTIONS') {
    const qs = questionsOf(a.questions);
    const given = Array.isArray(input.answers) ? input.answers.map((x) => (typeof x === 'string' ? x.trim().slice(0, LIMITS.answerLength) : '')) : [];
    answers = qs.map((_, i) => given[i] ?? '');
    const missing = answers.findIndex((x) => x.length < 2);
    if (missing >= 0) return { ok: false, error: `Answer question ${missing + 1}.`, status: 400 };
  }

  let key: string | null = null;
  if (input.file?.byteLength && a.kind !== 'QUESTIONS') {
    const kind = sniffResume(input.file);
    if (!kind || input.file.byteLength > MAX_RESUME_BYTES) return { ok: false, error: 'Files must be PDF or Word, under 5 MB. Share a link for anything else.', status: 400 };
    if (!resumeStorageReady()) return { ok: false, error: 'File upload isn’t available right now. Share a link instead.', status: 503 };
    key = `assessments/${a.id}/${crypto.randomUUID()}.${kind.ext}`;
    await putResume(key, input.file, kind.mime);
  }
  if ((a.kind === 'TAKE_HOME' || a.kind === 'WORK_SAMPLE') && !links.length && !key) return { ok: false, error: 'Add a link to your work or attach a file.', status: 400 };

  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 2000) || null : null;
  const r = await prisma.jobBoardAssessment.updateMany({
    where: { id: a.id, status: 'SENT' },
    data: {
      status: 'SUBMITTED', submittedAt: now, submissionUrl: links[0] ?? null, submissionLinks: links, submissionKey: key, submissionNote: note,
      ...(answers ? { answers: answers as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  return r.count ? { ok: true } : { ok: false, error: 'You’ve already submitted.', status: 409 };
}

/**
 * The reviewer's score and decision. The pass mark is advice: Move on goes to Interview; Not moving ahead needs a
 * reason (internal) and may send the rejection email.
 */
export async function reviewAssessment(session: Session, assessmentId: string, input: { score?: unknown; rubricScores?: unknown; notes?: unknown; decision?: unknown; rejectReason?: unknown; email?: MoveEmail | null }, now = new Date()):
  Promise<{ ok: true } | { ok: false; error: string; status: number; field?: string }> {
  const a = await prisma.jobBoardAssessment.findFirst({
    where: { id: assessmentId, status: { in: ['SENT', 'SUBMITTED', 'REVIEWED'] }, Application: { Listing: { employerId: session.id, ...(session.jobIds ? { id: { in: session.jobIds } } : {}) } } },
    select: { id: true, kind: true, status: true, maxScore: true, applicationId: true, rubric: true },
  });
  if (!a) return { ok: false, error: 'Assessment not found.', status: 404 };
  // Work the candidate hands in can't be scored before it arrives. Online tests and live exercises can.
  if ((a.kind === 'TAKE_HOME' || a.kind === 'QUESTIONS' || a.kind === 'WORK_SAMPLE') && a.status === 'SENT') return { ok: false, error: 'Wait for their submission, or extend the deadline.', status: 409 };
  const max = a.maxScore ?? 10;
  const rubric = rubricOf(a.rubric);
  let rubricScores: Record<string, number> | null = null;
  let score: number;
  if (rubric.length && input.rubricScores && typeof input.rubricScores === 'object') {
    rubricScores = Object.fromEntries(rubric.map((c) => [c.name, Number((input.rubricScores as Record<string, unknown>)[c.name])]));
    const total = rubricTotal(rubric, rubricScores, max);
    if (total == null) return { ok: false, error: 'Score every criterion from 1 to 5.', status: 400, field: 'rubricScores' };
    score = total;
  } else {
    score = Number(input.score);
    if (!Number.isFinite(score) || score < 0 || score > max) return { ok: false, error: `Score between 0 and ${max}.`, status: 400, field: 'score' };
  }
  const decision = input.decision === 'MOVE_ON' || input.decision === 'NOT_MOVING_AHEAD' ? input.decision : null;
  let reason: ExitReason | null = null;
  if (decision === 'NOT_MOVING_AHEAD') {
    reason = EXIT_REASONS.some((r) => r.code === input.rejectReason) ? (input.rejectReason as ExitReason) : null;
    if (!reason) return { ok: false, error: 'Choose why they’re not moving ahead.', status: 400, field: 'rejectReason' };
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) || null : null;
  await prisma.jobBoardAssessment.update({
    where: { id: a.id },
    data: { score, ...(rubricScores ? { rubricScores: rubricScores as unknown as Prisma.InputJsonValue } : {}), reviewNotes: notes, reviewerEmail: session.email, reviewedAt: now, status: 'REVIEWED' },
  });
  if (decision) {
    const ctx = await employerContext(session.id);
    await moveApplications({
      employerId: session.id, actorEmail: session.email, company: ctx.company, ids: [a.applicationId], batchKey: `assessment-review-${a.id}-${decision}`,
      ...(decision === 'MOVE_ON' ? { toStatus: 'INTERVIEW' as const, email: input.email ?? null } : { toStatus: 'REJECTED' as const, reason, note: notes, email: input.email ?? null, outcome: 'REJECTED' as const }),
    });
  }
  return { ok: true };
}

/** More time (open assessment), or let them submit again (already submitted). */
export async function extendAssessment(session: Session, assessmentId: string, input: { days?: unknown; resubmit?: unknown }, now = new Date()):
  Promise<{ ok: true; dueAt: string } | { ok: false; error: string; status: number }> {
  const days = Math.round(Number(input.days ?? 2));
  if (!Number.isFinite(days) || days < 1 || days > 14) return { ok: false, error: 'Between 1 and 14 days.', status: 400 };
  const a = await prisma.jobBoardAssessment.findFirst({
    where: { id: assessmentId, kind: { not: 'LIVE' }, Application: { Listing: { employerId: session.id } } },
    select: { id: true, status: true, dueAt: true },
  });
  if (!a) return { ok: false, error: 'Assessment not found.', status: 404 };
  const resubmit = input.resubmit === true;
  if (resubmit ? a.status !== 'SUBMITTED' && a.status !== 'REVIEWED' : a.status !== 'SENT') return { ok: false, error: resubmit ? 'Nothing submitted yet.' : 'It isn’t open any more.', status: 409 };
  const from = !resubmit && a.dueAt && a.dueAt > now ? a.dueAt : now;
  const dueAt = new Date(from.getTime() + days * DAY);
  await prisma.jobBoardAssessment.update({ where: { id: a.id }, data: { dueAt, remindedAt: null, ...(resubmit ? { status: 'SENT', reviewedAt: null } : {}) } });
  return { ok: true, dueAt: dueAt.toISOString() };
}

/** Stop an open assessment; the candidate is told when `notify` is on. */
export async function cancelAssessment(employerId: string, assessmentId: string, opts: { notify: boolean; actorEmail: string }): Promise<boolean> {
  const a = await prisma.jobBoardAssessment.findFirst({
    where: { id: assessmentId, status: { in: ['SENT', 'SUBMITTED'] }, Application: { Listing: { employerId } } },
    select: { id: true, Application: { select: { email: true, fullName: true, Listing: { select: { title: true } } } } },
  });
  if (!a) return false;
  await prisma.jobBoardAssessment.update({ where: { id: a.id }, data: { status: 'CANCELLED' } });
  if (opts.notify && !a.Application.email.endsWith('.invalid')) {
    const ctx = await employerContext(employerId);
    sendEmailFireAndForget({
      to: a.Application.email, replyTo: opts.actorEmail, type: 'assessment_cancelled',
      subject: `Update on your ${a.Application.Listing.title} assessment`.replace(/[\r\n]+/g, ' '),
      html: shell(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(a.Application.fullName.split(' ')[0])}, ${esc(ctx.company)} has changed its process for the <strong>${esc(a.Application.Listing.title)}</strong> role, so you don’t need to complete the assessment. The team will be in touch about next steps.</p>`),
    });
  }
  return true;
}

export async function listAssessments(applicationId: string, now = new Date()) {
  const rows = await prisma.jobBoardAssessment.findMany({ where: { applicationId }, orderBy: { createdAt: 'desc' }, take: 10 });
  return rows.map((a) => ({
    id: a.id, kind: a.kind, kindLabel: KIND_LABEL[a.kind as keyof typeof KIND_LABEL] ?? a.kind, title: a.title, status: a.status, brief: a.brief, url: a.url,
    dueAt: a.dueAt?.toISOString() ?? null, overdue: isOverdue(a, now),
    submittedAt: a.submittedAt?.toISOString() ?? null, submissionUrl: a.submissionUrl,
    links: a.submissionLinks.length ? a.submissionLinks : a.submissionUrl ? [a.submissionUrl] : [], hasFile: !!a.submissionKey, submissionNote: a.submissionNote,
    questions: questionsOf(a.questions), answers: questionsOf(a.answers), rubric: rubricOf(a.rubric), rubricScores: (a.rubricScores ?? null) as Record<string, number> | null,
    score: a.score, maxScore: a.maxScore, passMark: a.passMark, meetsPassMark: meetsPassMark(a), reviewNotes: a.reviewNotes, reviewerEmail: a.reviewerEmail,
    reviewedAt: a.reviewedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
  }));
}

/** Daily: one reminder to candidates whose deadline is within the next day. */
export async function assessmentReminders(now = new Date()): Promise<number> {
  const rows = await prisma.jobBoardAssessment.findMany({
    where: { status: 'SENT', remindedAt: null, dueAt: { gt: now, lte: new Date(now.getTime() + DAY) }, Application: { withdrawnAt: null, status: 'ASSESSMENT' } },
    select: { id: true, dueAt: true, kind: true, url: true, Application: { select: { email: true, fullName: true, Listing: { select: { title: true } } } } },
    take: 300,
  });
  for (const a of rows) {
    await prisma.jobBoardAssessment.update({ where: { id: a.id }, data: { remindedAt: now } });
    if (a.Application.email.endsWith('.invalid')) continue;
    const due = a.dueAt!.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', hour: 'numeric', minute: '2-digit' });
    sendEmailFireAndForget({
      to: a.Application.email, type: 'assessment_reminder',
      subject: `Reminder: your ${a.Application.Listing.title} assessment is due ${due}`.replace(/[\r\n]+/g, ' '),
      html: shell(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(a.Application.fullName.split(' ')[0])}, a quick reminder that your assessment for <strong>${esc(a.Application.Listing.title)}</strong> is due <strong>${esc(due)} IST</strong>. Use the link in our earlier email to submit. Need more time? Reply to that email.</p>`),
    });
  }
  return rows.length;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => {
  const fn = () => vi.fn(async (..._a: any[]): Promise<any> => null);
  return {
    jobBoardApplication: { findFirst: fn(), findMany: vi.fn(async (..._a: any[]): Promise<any> => []), findUnique: fn(), create: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'new1' })), update: fn(), updateMany: vi.fn(async (..._a: any[]): Promise<any> => ({ count: 1 })), delete: fn() },
    jobBoardApplicationNote: { create: fn() },
    jobBoardApplicationEvent: { create: fn() },
    jobBoardListing: { findFirst: fn(), findUnique: fn(), update: fn() },
    jobBoardDecision: { create: fn() },
    jobBoardOffer: { findFirst: fn(), findMany: vi.fn(async (..._a: any[]): Promise<any> => []), create: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'of1' })), update: fn(), updateMany: vi.fn(async (..._a: any[]): Promise<any> => ({ count: 1 })), count: vi.fn(async (..._a: any[]): Promise<any> => 0) },
    jobBoardAssessment: { findFirst: fn(), findUnique: fn(), create: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'as1' })), update: fn(), updateMany: vi.fn(async (..._a: any[]): Promise<any> => ({ count: 1 })), findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
    jobBoardInterview: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
    jobBoardTeamMember: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
    jobBoardEmployer: { findUnique: fn() },
    jobBoardPipelineTemplate: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
  };
});
const move = vi.hoisted(() => vi.fn(async (_o: any) => ({ moved: 1, skipped: 0, emailed: 0, scheduled: 0, failed: 0 })));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_o: any) => ({ success: true })), ff: vi.fn() }));
const filled = vi.hoisted(() => ({ close: vi.fn(async (..._a: any[]): Promise<any[]> => []), hires: vi.fn(async (..._a: any[]): Promise<any> => ({})) }));
const cancels = vi.hoisted(() => ({ interview: vi.fn(async () => true) }));

vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: { DbNull: 'DbNull' } }));
vi.mock('@/lib/email/send', () => ({ sendEmail: mail.send, sendEmailFireAndForget: mail.ff, sendEmailBatch: vi.fn() }));
vi.mock('@/lib/employer/pipeline', async () => ({ ...(await vi.importActual<any>('@/lib/employer/pipeline')), moveApplications: move }));
vi.mock('@/lib/employer/applications', () => ({ employerContext: async () => ({ company: 'Acme', bookingUrl: null, email: 'hr@acme.ai' }) }));
vi.mock('@/lib/employer/job-stages', async () => ({ ...(await vi.importActual<any>('@/lib/employer/job-stages')), closeFilledJobs: filled.close, hiresByJob: filled.hires }));
vi.mock('@/lib/employer/interviews', () => ({ cancelInterview: cancels.interview }));
const screen = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('@/lib/jobs/ai-screen', () => ({ screenApplication: screen }));
vi.mock('@/lib/jobs/skill-overrides', () => ({ ensureSkillOverrides: async () => undefined }));
vi.mock('@/lib/jobs/resume-storage', () => ({ putResume: vi.fn(), deleteResume: vi.fn(async () => undefined), resumeStorageReady: () => false, resumeDownloadUrl: vi.fn() }));

import { recordDecision } from '@/lib/employer/decisions';
import { markJoined, markNotJoined, recordOfferAnswer, recordWithdrawal, saveOffer, sendOffer } from '@/lib/employer/offers';
import { extendAssessment, reviewAssessment, sendAssessment, submitAssessment } from '@/lib/employer/assessments';
import { addSourced, contactSourced, markInterested, sweepSourced } from '@/lib/employer/sourcing';
import { updateJobPipeline } from '@/lib/employer/pipeline-templates';

beforeEach(() => vi.clearAllMocks());
const now = new Date('2026-11-19T06:00:00Z');
const owner = { id: 'emp1', role: 'OWNER' as const, email: 'founder@acme.ai', jobIds: null };
const recruiter = { id: 'emp1', role: 'RECRUITER' as const, email: 'rec@acme.ai', jobIds: null };

describe('final decision', () => {
  const app = (over: Record<string, unknown> = {}) => ({ id: 'a1', status: 'DECISION', Listing: { decisionOwnerEmail: null, decisionDelegateEmail: null, salaryCurrency: 'INR' }, ...over });

  it('only the decision owner (default: owners) records it, after the interviews, with a reason', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app());
    expect(await recordDecision({ session: recruiter, applicationId: 'a1', decision: 'PROCEED', reason: 'Best system design', now })).toMatchObject({ ok: false, status: 403 });
    expect(await recordDecision({ session: owner, applicationId: 'a1', decision: 'PROCEED', reason: 'x', now })).toMatchObject({ ok: false, field: 'reason' });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app({ status: 'SHORTLISTED' }));
    expect(await recordDecision({ session: owner, applicationId: 'a1', decision: 'PROCEED', reason: 'Best system design', now })).toMatchObject({ ok: false, status: 409 });
    expect(move).not.toHaveBeenCalled();
  });

  it('proceed: recorded, moved to Offer without an email, and an offer draft opened (also from the last interview)', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app({ status: 'INTERVIEW' }));
    const r = await recordDecision({ session: owner, applicationId: 'a1', decision: 'PROCEED', reason: 'Strongest on both rounds', now });
    expect(r).toEqual({ ok: true, offerId: 'of1' });
    expect(db.jobBoardDecision.create.mock.calls[0][0].data).toEqual({ applicationId: 'a1', decision: 'PROCEED', reason: 'Strongest on both rounds', decidedBy: 'founder@acme.ai' });
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'OFFER', email: null, reason: 'DECISION_PROCEED' });
    expect(db.jobBoardOffer.create.mock.calls[0][0].data).toMatchObject({ applicationId: 'a1', currency: 'INR', createdByEmail: 'founder@acme.ai' });
  });

  it('reject needs an internal reason; backup goes on hold', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app());
    expect(await recordDecision({ session: owner, applicationId: 'a1', decision: 'REJECT', reason: 'Weaker on ML depth', now })).toMatchObject({ ok: false, field: 'rejectReason' });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app());
    expect(await recordDecision({ session: owner, applicationId: 'a1', decision: 'REJECT', reason: 'Weaker on ML depth', rejectReason: 'SKILL_GAP', now })).toEqual({ ok: true });
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'REJECTED', reason: 'SKILL_GAP', note: 'Weaker on ML depth', outcome: 'REJECTED' });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app({ Listing: { decisionOwnerEmail: 'rec@acme.ai', decisionDelegateEmail: null, salaryCurrency: 'INR' } }));
    expect(await recordDecision({ session: recruiter, applicationId: 'a1', decision: 'BACKUP', reason: 'Good, second choice', now })).toEqual({ ok: true });
    expect(move.mock.calls[1][0].toStatus).toBe('ON_HOLD');
    expect(move.mock.calls[1][0].holdUntil.getTime()).toBe(now.getTime() + 30 * 864e5);
  });
});

describe('offer to joining', () => {
  const job = { id: 'j1', positions: 2, title: 'ML Engineer', decisionOwnerEmail: null, decisionDelegateEmail: null, recruitersSeeOffers: false, salaryMin: null, salaryMax: null, salaryCurrency: 'INR' };
  const app = (over: Record<string, unknown> = {}) => ({ id: 'a1', status: 'OFFER', fullName: 'Asha', email: 'a@x.co', joinedAt: null, joiningDate: null, withdrawnAt: null, listingId: 'j1', Listing: job, ...over });

  it('amounts: recruiters can’t set them unless the job allows; changes after sending keep a revision', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app());
    expect(await saveOffer(recruiter, 'a1', { fixedAnnual: 2000000 }, now)).toMatchObject({ ok: false, status: 403 });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app());
    db.jobBoardOffer.findFirst.mockResolvedValueOnce({ id: 'of1', status: 'SENT', fixedAnnual: 1800000, variableAnnual: null, joiningDate: null, revisions: [] });
    expect(await saveOffer(owner, 'a1', { fixedAnnual: 2000000, answerBy: '2026-11-26' }, now)).toEqual({ ok: true, id: 'of1' });
    const data = db.jobBoardOffer.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ fixedAnnual: 2000000, firmExpiry: false });
    expect(data.revisions).toEqual([{ at: now.toISOString(), by: 'founder@acme.ai', fixedAnnual: 1800000, variableAnnual: null, joiningDate: null }]);
  });

  it('sending warns when it would promise more people than there are openings', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValue(app());
    db.jobBoardOffer.findFirst.mockResolvedValue({ id: 'of1', status: 'DRAFT', fixedAnnual: 1800000 });
    filled.hires.mockResolvedValue({ j1: { joined: 1, awaiting: 0 } });
    db.jobBoardOffer.count.mockResolvedValue(1);
    const r = await sendOffer(owner, 'a1', {}, now);
    expect(r).toMatchObject({ ok: false, status: 409, warning: { positions: 2, committed: 2 } });
    expect(db.jobBoardOffer.update).not.toHaveBeenCalled();
    expect(await sendOffer(owner, 'a1', { confirmOvercommit: true }, now)).toEqual({ ok: true });
    expect(db.jobBoardOffer.update.mock.calls[0][0].data).toMatchObject({ status: 'SENT', sentAt: now });
    db.jobBoardApplication.findFirst.mockReset(); db.jobBoardOffer.findFirst.mockReset();
  });

  it('accepted reserves an opening (awaiting joining); declined ends it as Offer declined with an optional reason', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app());
    db.jobBoardOffer.findFirst.mockResolvedValueOnce({ id: 'of1', status: 'SENT', joiningDate: new Date('2026-12-15') });
    expect(await recordOfferAnswer(owner, 'a1', { answer: 'ACCEPTED' }, now)).toEqual({ ok: true });
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'HIRED', joined: false, joiningDate: new Date('2026-12-15'), email: null });

    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app());
    db.jobBoardOffer.findFirst.mockResolvedValueOnce({ id: 'of1', status: 'SENT' });
    expect(await recordOfferAnswer(owner, 'a1', { answer: 'DECLINED', reason: 'Accepted another offer' }, now)).toEqual({ ok: true });
    expect(move.mock.calls[1][0]).toMatchObject({ toStatus: 'REJECTED', outcome: 'OFFER_DECLINED', email: null, note: 'Accepted another offer' });
    expect(db.jobBoardApplication.update.mock.calls.at(-1)![0].data).toEqual({ outcomeReasonBy: 'CANDIDATE' });
  });

  it('joined fills an opening (and may close the job); did not join releases it and shows the backups', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app({ status: 'HIRED' }));
    filled.close.mockResolvedValueOnce([{ id: 'j1', title: 'ML Engineer', positions: 2, hired: 2, closed: true }]);
    expect(await markJoined(owner, 'a1', now)).toEqual({ ok: true, filledJobs: [{ id: 'j1', title: 'ML Engineer', positions: 2, hired: 2, closed: true }] });
    expect(db.jobBoardApplication.update.mock.calls[0][0].data).toEqual({ joinedAt: now });

    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app({ status: 'HIRED' }));
    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ id: 'b1', fullName: 'Ravi', status: 'ON_HOLD' }]);
    const r = await markNotJoined(owner, 'a1', { reason: 'Employer cancelled' }, now);
    expect(r).toEqual({ ok: true, backups: [{ id: 'b1', fullName: 'Ravi', status: 'ON_HOLD' }] });
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'REJECTED', outcome: 'NOT_JOINED', reasonBy: 'TEAM', note: 'Employer cancelled' });
  });

  it('a recorded withdrawal withdraws any open offer and sends nothing', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app({ status: 'INTERVIEW' }));
    expect(await recordWithdrawal(owner, 'a1', {}, now)).toEqual({ ok: true });
    expect(db.jobBoardOffer.updateMany.mock.calls[0][0]).toMatchObject({ data: { status: 'WITHDRAWN' } });
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'REJECTED', outcome: 'WITHDRAWN', reasonBy: null, email: null });
  });
});

describe('assessment', () => {
  const cfg = { kind: 'TAKE_HOME', brief: 'Build a tiny retrieval demo and share the repo with a short README.', deadlineDays: 3, maxScore: 10, passMark: 6 };
  const app = { id: 'a1', status: 'SHORTLISTED', fullName: 'Asha Rao', email: 'asha@x.co', listingId: 'j1', Listing: { title: 'ML Engineer', assessment: cfg } };

  it('sending creates it with a deadline, moves them to Assessment (no stage email) and emails the private link', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app);
    expect(await sendAssessment(owner, 'a1', {}, now)).toEqual({ ok: true, id: 'as1' });
    const data = db.jobBoardAssessment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ kind: 'TAKE_HOME', maxScore: 10, passMark: 6 });
    expect(data.dueAt).toEqual(new Date(now.getTime() + 3 * 864e5));
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'ASSESSMENT', email: null });
    expect(mail.send.mock.calls[0][0].html).toContain('/assessment/');
  });

  it('a job without an assessment, or one already open, can’t send', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ ...app, Listing: { title: 'x', assessment: null } });
    expect(await sendAssessment(owner, 'a1', {}, now)).toMatchObject({ ok: false, status: 409 });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app);
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce({ id: 'old' });
    expect(await sendAssessment(owner, 'a1', {}, now)).toMatchObject({ ok: false, status: 409 });
  });

  it('submissions close at the deadline; a link is enough', async () => {
    const token = 'a'.repeat(32);
    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ id: 'as1', status: 'SENT', dueAt: new Date('2026-11-18'), Application: { withdrawnAt: null } });
    expect(await submitAssessment(token, { url: 'https://github.com/x/y' }, now)).toMatchObject({ ok: false, status: 409 });
    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ id: 'as1', status: 'SENT', dueAt: new Date('2026-11-21'), Application: { withdrawnAt: null } });
    expect(await submitAssessment(token, { url: 'https://github.com/x/y', note: 'see README' }, now)).toEqual({ ok: true });
    expect(db.jobBoardAssessment.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'SUBMITTED', submissionUrl: 'https://github.com/x/y', submissionNote: 'see README' });
  });

  it('reviewing: a score alone, or a person’s decision (the pass mark never decides)', async () => {
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce({ id: 'as1', kind: 'TAKE_HOME', status: 'SUBMITTED', maxScore: 10, applicationId: 'a1' });
    expect(await reviewAssessment(owner, 'as1', { score: 3 }, now)).toEqual({ ok: true });
    expect(move).not.toHaveBeenCalled();
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce({ id: 'as1', kind: 'TAKE_HOME', status: 'SUBMITTED', maxScore: 10, applicationId: 'a1' });
    expect(await reviewAssessment(owner, 'as1', { score: 4, decision: 'MOVE_ON' }, now)).toEqual({ ok: true });
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'INTERVIEW' });
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce({ id: 'as1', kind: 'TAKE_HOME', status: 'SENT', maxScore: 10, applicationId: 'a1' });
    expect(await reviewAssessment(owner, 'as1', { score: 8 }, now)).toMatchObject({ ok: false, status: 409 });
  });

  it('written questions need every answer; work samples take several links', async () => {
    const token = 'b'.repeat(32);
    const base = { id: 'as2', status: 'SENT', dueAt: new Date('2026-11-21'), Application: { withdrawnAt: null } };
    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ ...base, kind: 'QUESTIONS', questions: ['Why us?', 'A hard bug you fixed?'] });
    expect(await submitAssessment(token, { answers: ['Because the mission', ''] }, now)).toMatchObject({ ok: false, error: 'Answer question 2.' });
    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ ...base, kind: 'QUESTIONS', questions: ['Why us?', 'A hard bug you fixed?'] });
    expect(await submitAssessment(token, { answers: ['Because the mission', 'A race in the cache layer'] }, now)).toEqual({ ok: true });
    expect(db.jobBoardAssessment.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'SUBMITTED', answers: ['Because the mission', 'A race in the cache layer'], submissionLinks: [] });

    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ ...base, kind: 'WORK_SAMPLE' });
    expect(await submitAssessment(token, {}, now)).toMatchObject({ ok: false, status: 400 });
    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ ...base, kind: 'WORK_SAMPLE' });
    expect(await submitAssessment(token, { links: ['http://x.co'] }, now)).toMatchObject({ ok: false, status: 400 });
    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ ...base, kind: 'WORK_SAMPLE' });
    expect(await submitAssessment(token, { links: ['https://behance.net/a', 'https://behance.net/b', 'https://behance.net/a', ''] }, now)).toEqual({ ok: true });
    expect(db.jobBoardAssessment.updateMany.mock.calls[1][0].data).toMatchObject({ submissionUrl: 'https://behance.net/a', submissionLinks: ['https://behance.net/a', 'https://behance.net/b'] });

    db.jobBoardAssessment.findUnique.mockResolvedValueOnce({ ...base, kind: 'EXTERNAL' });
    expect(await submitAssessment(token, {}, now)).toEqual({ ok: true });
  });

  it('a rubric works out the score; every criterion must be scored', async () => {
    const rec = { id: 'as1', kind: 'TAKE_HOME', status: 'SUBMITTED', maxScore: 10, applicationId: 'a1', rubric: [{ name: 'Quality', weight: 2 }, { name: 'Speed', weight: 1 }] };
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce(rec);
    expect(await reviewAssessment(owner, 'as1', { rubricScores: { Quality: 5 } }, now)).toMatchObject({ ok: false, field: 'rubricScores' });
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce(rec);
    expect(await reviewAssessment(owner, 'as1', { rubricScores: { Quality: 5, Speed: 2 } }, now)).toEqual({ ok: true });
    // (5·2 + 2·1) / (5·3) × 10 = 8
    expect(db.jobBoardAssessment.update.mock.calls[0][0].data).toMatchObject({ score: 8, rubricScores: { Quality: 5, Speed: 2 } });
  });

  it('sending can shorten the deadline and carry a personal note', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(app);
    expect(await sendAssessment(owner, 'a1', { deadlineDays: 5, note: 'Take your time on the README.' }, now)).toMatchObject({ ok: true });
    expect(db.jobBoardAssessment.create.mock.calls[0][0].data.dueAt).toEqual(new Date(now.getTime() + 5 * 864e5));
    expect(mail.send.mock.calls[0][0].html).toContain('Take your time on the README.');
  });

  it('extending moves the deadline; a resubmission reopens it', async () => {
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce({ id: 'as1', status: 'SENT', dueAt: new Date('2026-11-18T06:00:00Z') });
    expect(await extendAssessment(owner, 'as1', { days: 2 }, now)).toEqual({ ok: true, dueAt: new Date(now.getTime() + 2 * 864e5).toISOString() });
    db.jobBoardAssessment.findFirst.mockResolvedValueOnce({ id: 'as1', status: 'SUBMITTED', dueAt: null });
    expect(await extendAssessment(owner, 'as1', { days: 2, resubmit: true }, now)).toMatchObject({ ok: true });
    expect(db.jobBoardAssessment.update.mock.calls[1][0].data).toMatchObject({ status: 'SENT', reviewedAt: null });
  });
});

describe('sourcing', () => {
  it('adds to the lane (not the pipeline) and refuses someone already on the job', async () => {
    db.jobBoardListing.findFirst.mockResolvedValueOnce({ id: 'j1', skills: ['Python', 'SQL'] });
    db.jobBoardApplication.findUnique.mockResolvedValueOnce(null);
    // Skills the resume reader returned to the form: only the job's own are kept, in the job's wording.
    const r = await addSourced({ employerId: 'emp1', listingId: 'j1', actorEmail: 'rec@acme.ai', jobIds: null, input: { fullName: 'Asha Rao', email: 'asha@x.co', channel: 'LinkedIn', note: 'Met at an event', skills: ['python', 'Rust'] }, now });
    expect(r).toMatchObject({ ok: true, id: 'new1' });
    expect(db.jobBoardApplication.create.mock.calls[0][0].data).toMatchObject({ source: 'SOURCED', sourcedState: 'ADDED', sourcedChannel: 'LinkedIn', sourcedBy: 'rec@acme.ai', resumeKey: null, confirmedSkills: ['Python'], matchedSkills: ['Python'] });
    expect(db.jobBoardApplicationNote.create).toHaveBeenCalled();

    db.jobBoardListing.findFirst.mockResolvedValueOnce({ id: 'j1', skills: [] });
    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ id: 'old' });
    expect(await addSourced({ employerId: 'emp1', listingId: 'j1', actorEmail: 'rec@acme.ai', jobIds: null, input: { fullName: 'Asha Rao', email: 'asha@x.co' }, now })).toMatchObject({ ok: false, status: 409, existingId: 'old' });
  });

  it('first contact says how we got their details, offers removal, and doesn’t start stage emails', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'a1', email: 'asha@x.co', sourcedState: 'ADDED', sourcedChannel: 'Referral', contactedAt: null });
    expect(await contactSourced({ employerId: 'emp1', id: 'a1', actorEmail: 'rec@acme.ai', subject: 'ML Engineer at Acme', body: 'Hi Asha, would you be open to a quick chat about this role?', now })).toEqual({ ok: true });
    const m = mail.send.mock.calls[0][0];
    expect(m).toMatchObject({ to: 'asha@x.co', replyTo: 'rec@acme.ai', type: 'sourced_contact' });
    expect(m.html).toContain('through a referral');
    expect(m.html).toContain('Remove my details');
    expect(db.jobBoardApplication.update.mock.calls[0][0].data).toMatchObject({ sourcedState: 'CONTACTED', contactedAt: now });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'a1', email: 'asha@x.co', sourcedState: 'CONTACTED', sourcedChannel: null, contactedAt: new Date(now.getTime() - 3600_000) });
    expect(await contactSourced({ employerId: 'emp1', id: 'a1', actorEmail: 'rec@acme.ai', subject: 'Follow up', body: 'Just checking in about the role, Asha.', now })).toMatchObject({ ok: false, status: 429 });
  });

  it('interested: enters the pipeline as New; the retention sweep targets only stale sourced records', async () => {
    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ resumeKey: null, confirmedSkills: ['Python'], Listing: { employerId: 'emp1', isGeneral: false, skills: ['Python'] } });
    expect(await markInterested({ employerId: 'emp1', id: 'a1', actor: 'candidate', now })).toBe(true);
    expect(db.jobBoardApplication.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'a1', sourcedState: { in: ['ADDED', 'CONTACTED'] } }, data: { sourcedState: 'INTERESTED', status: 'APPLIED' } });
    // Same automatic AI review as an applicant (it still checks the plan, quota and the auto-review switch itself).
    await vi.waitFor(() => expect(screen).toHaveBeenCalledWith('a1', 'emp1', { auto: true }));
    await sweepSourced(now);
    const or = db.jobBoardApplication.findMany.mock.calls[0][0].where.OR;
    expect(or[0]).toEqual({ sourcedState: 'ADDED', appliedAt: { lt: new Date(now.getTime() - 90 * 864e5) } });
    expect(or[2]).toEqual({ sourcedState: 'CONTACTED', contactedAt: { lt: new Date(now.getTime() - 180 * 864e5) } });
  });
});

describe('editing a live job’s pipeline', () => {
  const listing = { id: 'j1', title: 'ML Engineer', pipelineTemplate: 'WITH_ASSESSMENT', pipelineVersion: 1, assessment: { kind: 'TAKE_HOME', brief: 'Build a tiny retrieval demo and share the repo.', deadlineDays: 3, maxScore: 10, passMark: 6 }, interviewRounds: ['Technical', 'Founder chat'], decisionOwnerEmail: null, decisionDelegateEmail: null, recruitersSeeOffers: false };

  it('turning off the assessment with people mid-way asks first, then cancels (telling them) or lets them finish', async () => {
    db.jobBoardListing.findFirst.mockResolvedValue(listing);
    db.jobBoardAssessment.findMany.mockResolvedValue([{ id: 'as1', status: 'SENT', Application: { fullName: 'Asha' } }]);
    const input = { config: { assessment: null, rounds: ['Technical', 'Founder chat'] } };
    const first = await updateJobPipeline({ session: owner, listingId: 'j1', input, now });
    expect(first).toMatchObject({ ok: false, status: 409, needsChoice: true, impact: { openAssessments: [{ id: 'as1', candidate: 'Asha', status: 'SENT' }] } });
    expect(db.jobBoardListing.findUnique).not.toHaveBeenCalled();
    // People who've left, been turned down or been hired aren't "in progress", so they're never listed or emailed.
    expect(db.jobBoardAssessment.findMany.mock.calls[0][0].where.Application).toEqual({ listingId: 'j1', withdrawnAt: null, status: { notIn: ['REJECTED', 'HIRED'] } });

    db.jobBoardAssessment.findFirst.mockResolvedValueOnce({ id: 'as1', Application: { email: 'asha@x.co', fullName: 'Asha', Listing: { title: 'ML Engineer' } } });
    const r = await updateJobPipeline({ session: owner, listingId: 'j1', input: { ...input, affected: 'cancel' }, now });
    expect(r).toMatchObject({ ok: true });
    expect(db.jobBoardAssessment.update.mock.calls[0][0].data).toEqual({ status: 'CANCELLED' });
    expect(mail.ff.mock.calls[0][0].type).toBe('assessment_cancelled');
    expect(db.jobBoardListing.update.mock.calls[0][0].data).toMatchObject({ assessment: 'DbNull', interviewRounds: ['Technical', 'Founder chat'] });
    db.jobBoardListing.findFirst.mockReset(); db.jobBoardAssessment.findMany.mockReset();
  });

  it('only owners change who decides and who sees offers', async () => {
    db.jobBoardListing.findFirst.mockResolvedValueOnce(listing);
    expect(await updateJobPipeline({ session: recruiter, listingId: 'j1', input: { recruitersSeeOffers: true }, now })).toMatchObject({ ok: false, status: 403 });
  });
});

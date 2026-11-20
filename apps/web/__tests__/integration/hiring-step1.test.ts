import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const who = vi.hoisted(() => ({ session: { id: 'emp1', email: 'hr@acme.co', role: 'OWNER', jobIds: null as string[] | null, memberId: null as string | null, memberName: null } as any }));
const db = vi.hoisted(() => ({
  jobBoardApplication: { findMany: vi.fn(), count: vi.fn(async () => 0), updateMany: vi.fn(async () => ({ count: 1 })) },
  jobBoardListing: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(async () => 0) },
  jobBoardEmployer: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  jobBoardTeamMember: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 1 })), findFirst: vi.fn() },
  jobBoardAiScreening: { count: vi.fn(async () => 0) },
  jobBoardApplicationEvent: { count: vi.fn(async () => 0) },
}));
const move = vi.hoisted(() => vi.fn(async (_opts: any) => ({ moved: 1, skipped: 0, emailed: 1, scheduled: 0, failed: 0 })));
const sent = vi.hoisted(() => vi.fn(async (_opts: any) => ({ success: true })));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: vi.fn(async () => who.session) }));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => 'ip' }));
vi.mock('@/lib/event-rate-limit', () => ({ applicationStatusRateLimit: {} }));
vi.mock('@/lib/email/send', () => ({ sendEmail: sent, sendEmailBatch: vi.fn(), sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/employer/pipeline', async () => {
  const actual = await vi.importActual<any>('@/lib/employer/pipeline');
  return { ...actual, moveApplications: move };
});
vi.mock('@/lib/employer/applications', async () => {
  const actual = await vi.importActual<any>('@/lib/employer/applications');
  return {
    ...actual,
    employerContext: async () => ({ company: 'Acme', bookingUrl: null, email: 'hr@acme.co' }),
    saveBookingUrl: async (_e: string, _i: unknown, cur: string | null) => cur,
  };
});

import { PATCH } from '@/app/api/employer/applications/[id]/route';
import { POST as BULK } from '@/app/api/employer/applications/bulk/route';
import { POST as UNSUB } from '@/app/api/employer/weekly-report/unsubscribe/route';
import { PATCH as NOTIFY } from '@/app/api/employer/notifications/route';
import { notifyClosedJob } from '@/lib/employer/closing';
import { loadTopTen } from '@/lib/employer/applications';
import { reportToken, runWeeklyReports } from '@/lib/employer/weekly-report';

process.env.EMPLOYER_JWT_SECRET = 'test-employer-secret-min-32-characters-long';

const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/employer/applications/a1', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'a1' }) });
const bulk = (body: unknown) => BULK(new NextRequest('http://localhost/api/employer/applications/bulk', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  who.session = { id: 'emp1', email: 'hr@acme.co', role: 'OWNER', jobIds: null, memberId: null, memberName: null };
});

describe('reject with a reason, On hold', () => {
  it('refuses a reject without a reason and never moves anyone', async () => {
    const res = await patch({ toStatus: 'REJECTED' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('reason');
    expect(move).not.toHaveBeenCalled();
  });

  it('passes the reason and note to the move', async () => {
    const res = await patch({ toStatus: 'REJECTED', reason: 'OTHER', note: 'wants remote only' });
    expect(res.status).toBe(200);
    expect(move.mock.calls[0][0]).toMatchObject({ ids: ['a1'], toStatus: 'REJECTED', reason: 'OTHER', note: 'wants remote only', holdUntil: null });
  });

  it('On hold gets a come-back date (30 days by default)', async () => {
    await patch({ toStatus: 'ON_HOLD' });
    const until = (move.mock.calls[0][0] as any).holdUntil as Date;
    expect(Math.round((until.getTime() - Date.now()) / 864e5)).toBe(30);
  });

  it('bulk reject asks for one reason for everyone', async () => {
    expect((await bulk({ toStatus: 'REJECTED', ids: ['a1', 'a2'], batchKey: 'batch-key-123' })).status).toBe(400);
    expect(move).not.toHaveBeenCalled();
    expect((await bulk({ toStatus: 'REJECTED', ids: ['a1', 'a2'], batchKey: 'batch-key-123', reason: 'SKILL_GAP' })).status).toBe(200);
    expect(move.mock.calls[0][0]).toMatchObject({ ids: ['a1', 'a2'], reason: 'SKILL_GAP' });
  });

  it('interviewers can’t reject or hold', async () => {
    who.session.role = 'INTERVIEWER';
    expect((await patch({ toStatus: 'REJECTED', reason: 'SALARY' })).status).toBe(403);
    expect((await patch({ toStatus: 'ON_HOLD' })).status).toBe(403);
    expect(move).not.toHaveBeenCalled();
  });
});

describe('closing emails (no-ghosting)', () => {
  const listing = (over: Record<string, unknown> = {}) => db.jobBoardListing.findUnique.mockResolvedValueOnce({
    id: 'job1', status: 'CLOSED', isGeneral: false, employerId: 'emp1', Employer: { email: 'hr@acme.co', passwordHash: 'x' }, ...over,
  });

  it('moves everyone still waiting to Rejected once, with the closed reason and a fixed batch key', async () => {
    listing();
    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }]);
    await notifyClosedJob('job1', 'owner@acme.co');
    const where = db.jobBoardApplication.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ listingId: 'job1', withdrawnAt: null, closingEmailedAt: null, status: { in: ['APPLIED', 'REVIEWED', 'SHORTLISTED', 'ON_HOLD'] } });
    expect(where.NOT).toEqual({ email: { endsWith: '@deleted.invalid' } });
    expect(move.mock.calls[0][0]).toMatchObject({ ids: ['a1', 'a2'], toStatus: 'REJECTED', reason: 'POSITION_CLOSED', batchKey: 'closed-job1', actorEmail: 'owner@acme.co' });
    expect(db.jobBoardApplication.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a1', 'a2'] } }, data: { closingEmailedAt: expect.any(Date) } });
  });

  it('does nothing for open jobs, general applications or admin-managed workspaces', async () => {
    listing({ status: 'OPEN' });
    listing({ isGeneral: true });
    listing({ Employer: { email: 'x@udyaibase.com', passwordHash: '' } });
    for (let i = 0; i < 3; i++) expect(await notifyClosedJob('job1')).toEqual({ moved: 0, emailed: 0, failed: 0 });
    expect(db.jobBoardApplication.findMany).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });
});

describe('Top 10', () => {
  const app = (id: string, fit: number | null, over: Record<string, unknown> = {}) => ({
    id, listingId: 'job1', fullName: id, currentTitle: null, currentCompany: null, experienceYears: 3, noticePeriodDays: 30, expectedCtcLakh: null,
    city: null, confirmedSkills: [], matchedSkills: [], screeningAnswers: [], appliedAt: new Date('2026-11-10'), statusChangedAt: null,
    Listing: { title: 'ML Engineer', isGeneral: false, skills: [], mustHaveSkills: [], experienceMin: null, experienceMax: null, workType: 'REMOTE', city: null, salaryMax: null, salaryCurrency: 'INR', maxNoticeDays: null, screeningQuestions: null },
    AiScreening: fit == null ? null : { status: 'DONE', fitScore: fit, recommendation: fit < 40 ? 'weak' : 'shortlist', result: { summary: `s-${id}`, strengths: [{ point: 'p', evidence: 'e' }], gaps: [] } },
    ...over,
  });

  it('ranks AI-reviewed candidates by fit, drops weak ones, and counts the unreviewed', async () => {
    db.jobBoardApplication.findMany.mockResolvedValueOnce([app('low', 55), app('none', null), app('high', 92), app('weak', 20)]);
    const top = await loadTopTen('emp1');
    expect(top.candidates.map((c) => c.id)).toEqual(['high', 'low', 'none']);
    expect(top.candidates[0].ai).toMatchObject({ fitScore: 92, summary: 's-high' });
    expect(top.unscreened).toBe(1);
    const where = db.jobBoardApplication.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: { in: ['APPLIED', 'REVIEWED'] }, withdrawnAt: null, Listing: { employerId: 'emp1' } });
  });

  it('keeps interviewers to their own jobs', async () => {
    const top = await loadTopTen('emp1', 'other', ['job1']);
    expect(top.candidates).toEqual([]);
    expect(db.jobBoardApplication.findMany).not.toHaveBeenCalled();
  });
});

describe('weekly report', () => {
  it('sends nothing when another run already claimed this week', async () => {
    db.jobBoardEmployer.findMany.mockResolvedValueOnce([{ id: 'emp1' }]);
    db.jobBoardEmployer.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await runWeeklyReports(new Date('2026-12-07T03:30:00Z'));
    expect(r).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).not.toHaveBeenCalled();
  });

  it('unsubscribe needs a valid signed link', async () => {
    const bad = await UNSUB(new NextRequest('http://localhost/api/employer/weekly-report/unsubscribe?k=member&id=m1&t=forged', { method: 'POST' }));
    expect(bad.status).toBe(404);
    expect(db.jobBoardTeamMember.updateMany).not.toHaveBeenCalled();
    const t = reportToken({ kind: 'member', id: 'm1' });
    const ok = await UNSUB(new NextRequest(`http://localhost/api/employer/weekly-report/unsubscribe?k=member&id=m1&t=${t}`, { method: 'POST' }));
    expect(ok.status).toBe(200);
    expect(db.jobBoardTeamMember.updateMany).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { weeklyReport: false } });
  });

  it('a teammate can only switch their own report; interviewers can’t', async () => {
    who.session = { ...who.session, role: 'RECRUITER', memberId: 'm9' };
    await NOTIFY(new NextRequest('http://localhost/api/employer/notifications', { method: 'PATCH', body: JSON.stringify({ weeklyReport: false }) }));
    expect(db.jobBoardTeamMember.updateMany).toHaveBeenCalledWith({ where: { id: 'm9', employerId: 'emp1' }, data: { weeklyReport: false } });
    who.session = { ...who.session, role: 'INTERVIEWER' };
    expect((await NOTIFY(new NextRequest('http://localhost/api/employer/notifications', { method: 'PATCH', body: JSON.stringify({ weeklyReport: true }) }))).status).toBe(403);
  });
});

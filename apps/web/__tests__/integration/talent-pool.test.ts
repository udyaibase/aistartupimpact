import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const db = vi.hoisted(() => ({
  jobBoardApplication: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 1 })),
    groupBy: vi.fn(async () => []), update: vi.fn(),
  },
  jobBoardApplicationEvent: { findMany: vi.fn(async () => []) },
  jobBoardApplicationNote: { findMany: vi.fn(async () => []) },
  jobBoardListing: { findFirst: vi.fn(), findMany: vi.fn(async () => []), updateMany: vi.fn() },
  jobBoardTalentInvite: { findFirst: vi.fn(async () => null), create: vi.fn(), count: vi.fn(async () => 0) },
  jobBoardEmployer: { update: vi.fn() },
  jobBoardAiScreening: { findMany: vi.fn(async () => []) },
}));
const mail = vi.hoisted(() => ({ sendEmailFireAndForget: vi.fn() }));
const who = vi.hoisted(() => ({ role: 'OWNER', jobIds: null as string[] | null }));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => mail);
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ success: true })), getClientIdentifier: () => 'ip', apiRateLimit: {} }));
vi.mock('@/lib/event-rate-limit', () => ({ applicationStatusRateLimit: {} }));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: async () => null }));
vi.mock('@/lib/employer/applications', () => ({ employerContext: vi.fn(async () => ({ company: 'Acme AI', bookingUrl: null, email: '' })) }));
vi.mock('@/lib/jobs/candidate-status', () => ({ eraseApplication: vi.fn() }));
vi.mock('@/lib/jobs/ai-screen', () => ({ screenApplication: vi.fn() }));
vi.mock('@/lib/employer/owners', () => ({ isRealInbox: () => true }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: async () => ({ id: 'emp1', email: 'hr@acme.co', role: who.role, jobIds: who.jobIds }) }));
vi.mock('@/lib/employer/permissions', async () => {
  const roles = await vi.importActual<any>('@/lib/employer/roles');
  return {
    can: roles.can,
    forbidden: () => NextResponse.json({}, { status: 403 }),
    requireEmployerPermission: async (p: string) =>
      roles.can(who.role, p) ? { id: 'emp1', email: 'hr@acme.co', role: who.role, jobIds: who.jobIds } : NextResponse.json({}, { status: 403 }),
  };
});

process.env.EMPLOYER_JWT_SECRET = 'test-secret-for-talent-pool-0123456789';

import { extendPool, leavePool, poolEmailHeaders, poolLink, poolToken, verifyPoolToken } from '@/lib/jobs/talent-pool';
import { POST as oneClickLeave } from '@/app/api/talent-pool/leave/route';
import { PUT as putTags } from '@/app/api/employer/talent/tags/route';
import { POST as invite } from '@/app/api/employer/talent/invite/route';
import { loadTalentPool } from '@/lib/employer/talent';
import { runHiringMaintenance } from '@/lib/employer/lifecycle';
import { cleanTags } from '@/lib/employer/talent-tags';

const DAY = 864e5;
const person = { email: 'Cand@X.co', fullName: 'Ravi Kumar', Listing: { employerId: 'emp1' } };

beforeEach(() => { vi.clearAllMocks(); who.role = 'OWNER'; who.jobIds = null; });

describe('leave and extend links', () => {
  it('signed per action: a leave link can’t extend', () => {
    expect(verifyPoolToken('a1', 'leave', poolToken('a1', 'leave'))).toBe(true);
    expect(verifyPoolToken('a1', 'extend', poolToken('a1', 'leave'))).toBe(false);
    expect(verifyPoolToken('a2', 'leave', poolToken('a1', 'leave'))).toBe(false);
    expect(poolLink('a1', 'extend')).toContain('/talent-pool?a=extend&id=a1&t=');
    expect(poolEmailHeaders('a1')['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('leaving removes the person from the company’s pool on every application', async () => {
    db.jobBoardApplication.findUnique.mockResolvedValue(person);
    expect(await leavePool('a1')).toEqual({ ok: true, employerId: 'emp1' });
    expect((db.jobBoardApplication.updateMany.mock.calls[0] as any)[0]).toMatchObject({
      where: { email: { equals: 'Cand@X.co', mode: 'insensitive' }, Listing: { employerId: 'emp1' } },
      data: { talentPoolUntil: null, talentPoolReminderAt: null },
    });
  });

  it('extending gives 12 months from today, only while in the pool or within 30 days of it ending', async () => {
    db.jobBoardApplication.findUnique.mockResolvedValue(person);
    const now = new Date('2027-01-01T00:00:00Z');
    const r = await extendPool('a1', now);
    expect(r.until?.toISOString()).toBe('2028-01-01T00:00:00.000Z');
    const where = (db.jobBoardApplication.updateMany.mock.calls[0] as any)[0].where;
    expect(where.talentPoolUntil.gt.toISOString()).toBe(new Date(now.getTime() - 30 * DAY).toISOString());
    db.jobBoardApplication.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await extendPool('a1', now)).ok).toBe(false);
  });

  it('erased applicants can’t be acted on', async () => {
    db.jobBoardApplication.findUnique.mockResolvedValue({ ...person, email: 'deleted-a1@deleted.invalid' });
    expect((await leavePool('a1')).ok).toBe(false);
  });

  it('one-click unsubscribe (mail apps POST it) checks the signature', async () => {
    db.jobBoardApplication.findUnique.mockResolvedValue(person);
    const bad = await oneClickLeave(new NextRequest('http://localhost/api/talent-pool/leave?id=a1&t=nope', { method: 'POST' }));
    expect(bad.status).toBe(404);
    const ok = await oneClickLeave(new NextRequest(`http://localhost/api/talent-pool/leave?id=a1&t=${poolToken('a1', 'leave')}`, { method: 'POST' }));
    expect(ok.status).toBe(200);
    expect(db.jobBoardApplication.updateMany).toHaveBeenCalled();
  });
});

describe('team tags', () => {
  it('cleans tags: trimmed, lower-case, no duplicates, at most 8', () => {
    expect(cleanTags(['  Backend ', 'backend', 'Next   Quarter', '<b>x'])).toEqual(['backend', 'next quarter', 'bx']);
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(8);
    expect(cleanTags('backend')).toBeNull();
  });

  it('saves on all of the person’s applications at this company; job-limited teammates can’t', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValue({ email: 'cand@x.co' });
    const req = () => new NextRequest('http://localhost/api/employer/talent/tags', { method: 'PUT', body: JSON.stringify({ applicationId: 'a1', tags: ['Backend'] }) });
    const res = await putTags(req());
    expect(await res.json()).toEqual({ tags: ['backend'] });
    expect((db.jobBoardApplication.updateMany.mock.calls[0] as any)[0].where.Listing).toEqual({ employerId: 'emp1' });
    who.role = 'RECRUITER'; who.jobIds = ['j1'];
    expect((await putTags(req())).status).toBe(403);
  });
});

describe('invites', () => {
  const call = () => invite(new NextRequest('http://localhost/api/employer/talent/invite', { method: 'POST', body: JSON.stringify({ applicationId: 'a1', listingId: 'ml' }) }));

  it('include one-click unsubscribe and a leave link', async () => {
    db.jobBoardApplication.findFirst
      .mockResolvedValueOnce({ id: 'a1', email: 'cand@x.co', fullName: 'Ravi Kumar' })
      .mockResolvedValueOnce(null) // not applied
      .mockResolvedValueOnce(null); // not hired
    db.jobBoardListing.findFirst.mockResolvedValue({ id: 'ml', title: 'ML Engineer', slug: 'ml-engineer' });
    expect((await call()).status).toBe(200);
    const email = mail.sendEmailFireAndForget.mock.calls[0][0];
    expect(email.headers['List-Unsubscribe']).toContain('/api/talent-pool/leave?id=a1');
    expect(email.html).toContain('/talent-pool?a=leave');
  });

  it('are refused for someone you already hired', async () => {
    db.jobBoardApplication.findFirst
      .mockResolvedValueOnce({ id: 'a1', email: 'cand@x.co', fullName: 'Ravi Kumar' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'hired-app' });
    db.jobBoardListing.findFirst.mockResolvedValue({ id: 'ml', title: 'ML Engineer', slug: 'ml-engineer' });
    expect((await call()).status).toBe(409);
    expect(mail.sendEmailFireAndForget).not.toHaveBeenCalled();
  });
});

describe('pool list', () => {
  it('one row per person, hides people you hired, shows the furthest stage reached', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const row = (id: string, email: string, status: string, days: number) => ({
      id, email, fullName: id, currentTitle: null, currentCompany: null, city: null, experienceYears: 3, confirmedSkills: ['python'],
      appliedAt: new Date(now.getTime() - days * DAY), status, talentPoolUntil: new Date(now.getTime() + (365 - days) * DAY), talentTags: id === 'b2' ? ['backend'] : [],
      Listing: { title: 'Role', isGeneral: false }, TalentInvites: [],
    });
    db.jobBoardApplication.findMany
      .mockResolvedValueOnce([row('b1', 'b@x.co', 'REJECTED', 10), row('b2', 'B@x.co', 'REJECTED', 200), row('h1', 'h@x.co', 'REVIEWED', 5)] as never)
      .mockResolvedValueOnce([
        { email: 'b@x.co', listingId: 'l1', status: 'REJECTED', withdrawnAt: null },
        { email: 'h@x.co', listingId: 'l2', status: 'HIRED', withdrawnAt: null },
      ] as never);
    db.jobBoardApplicationEvent.findMany.mockResolvedValueOnce([{ applicationId: 'b2', toStatus: 'INTERVIEW' }] as never);
    const { people, hiredHidden } = await loadTalentPool('emp1', now);
    expect(hiredHidden).toBe(1);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ id: 'b1', furthestStage: 'Interviewed, not selected', tags: ['backend'], expiringSoon: false });
  });
});

describe('daily job', () => {
  it('reminds once, 30 days before the pool ends, with extend and leave links', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    db.jobBoardApplication.groupBy.mockResolvedValue([] as never);
    // 1st findMany = pool ending; 2nd = retention due.
    db.jobBoardApplication.findMany
      .mockResolvedValueOnce([
        { id: 'a1', email: 'c@x.co', fullName: 'Ravi Kumar', talentPoolUntil: new Date(now.getTime() + 20 * DAY), Listing: { employerId: 'emp1' } },
        { id: 'a0', email: 'C@x.co', fullName: 'Ravi Kumar', talentPoolUntil: new Date(now.getTime() + 25 * DAY), Listing: { employerId: 'emp1' } },
      ] as never)
      .mockResolvedValueOnce([] as never);
    const r = await runHiringMaintenance(now);
    expect(r.poolRemindersSent).toBe(1);
    const sent = mail.sendEmailFireAndForget.mock.calls.map((c) => c[0]).filter((e) => e.type === 'job_talent_pool_ending');
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Your talent pool membership with Acme AI ends in 30 days');
    expect(sent[0].html).toContain('/talent-pool?a=extend');
    expect(sent[0].headers['List-Unsubscribe']).toBeTruthy();
  });

  it('deletes finished applications 30 days after the pool ends, not 6 months', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    db.jobBoardApplication.groupBy.mockResolvedValue([] as never);
    db.jobBoardApplication.findMany.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
    await runHiringMaintenance(now);
    const where = (db.jobBoardApplication.findMany.mock.calls[1] as any)[0].where;
    const poolRule = where.OR[1];
    expect(poolRule.talentPoolUntil.lt.toISOString()).toBe(new Date(now.getTime() - 30 * DAY).toISOString());
    expect(poolRule.OR).toEqual(expect.arrayContaining([{ status: 'REJECTED' }, { withdrawnAt: { not: null } }]));
  });
});

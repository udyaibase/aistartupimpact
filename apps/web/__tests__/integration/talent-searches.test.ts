import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const db = vi.hoisted(() => ({
  jobBoardApplication: { findFirst: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []), groupBy: vi.fn(async () => []) },
  jobBoardApplicationNote: { findMany: vi.fn(async () => []) },
  jobBoardApplicationEvent: { findMany: vi.fn(async () => []) },
  jobBoardListing: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
  jobBoardTalentInvite: { findFirst: vi.fn(async () => null), create: vi.fn(), count: vi.fn(async () => 0) },
  jobBoardSavedTalentSearch: {
    findMany: vi.fn(async (): Promise<any[]> => []), count: vi.fn(async () => 0), create: vi.fn(async (a: any) => ({ id: 's1', ...a.data })),
    updateMany: vi.fn(async () => ({ count: 1 })), deleteMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(),
  },
  jobBoardTeamMember: { findFirst: vi.fn(async (): Promise<any> => null) },
}));
const mail = vi.hoisted(() => ({ sendEmailFireAndForget: vi.fn(), sendEmail: vi.fn(async () => ({ success: true })) }));
const who = vi.hoisted(() => ({ role: 'OWNER', jobIds: null as string[] | null }));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => mail);
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ success: true })), getClientIdentifier: () => 'ip', apiRateLimit: {} }));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: async () => null }));
vi.mock('@/lib/employer/applications', () => ({ employerContext: vi.fn(async () => ({ company: 'Acme AI', bookingUrl: null, email: '' })) }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: async () => ({ id: 'emp1', email: 'hr@acme.co', role: who.role, jobIds: who.jobIds }) }));
vi.mock('@/lib/employer/permissions', async () => {
  const roles = await vi.importActual<any>('@/lib/employer/roles');
  return { can: roles.can, canSeeJob: () => true, forbidden: () => NextResponse.json({}, { status: 403 }) };
});

process.env.EMPLOYER_JWT_SECRET = 'test-secret-for-talent-searches-0123456789';

import { GET as listSearches, POST as saveSearch } from '@/app/api/employer/talent/searches/route';
import { PATCH as patchSearch, DELETE as deleteSearch } from '@/app/api/employer/talent/searches/[id]/route';
import { POST as bulkInvite } from '@/app/api/employer/talent/invite-bulk/route';
import { POST as singleInvite } from '@/app/api/employer/talent/invite/route';
import { cleanTalentFilters, describeFilters, matchesTalentFilters } from '@/lib/employer/talent-filters';
import { runTalentAlerts } from '@/lib/employer/talent-alerts';
import type { PoolCandidate } from '@/lib/employer/talent';

const DAY = 864e5;
const req = (body: unknown, method = 'POST') => new NextRequest('http://x/api', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const base: PoolCandidate = {
  id: 'a1', fullName: 'Ravi Kumar', currentTitle: 'Engineer', currentCompany: 'X', city: 'Pune', experienceYears: 4,
  skills: ['React'], appliedFor: 'Frontend', appliedAt: new Date().toISOString(), furthestStage: 'Interviewed', furthestRank: 3,
  poolUntil: new Date(Date.now() + 300 * DAY).toISOString(), expiringSoon: false, invitedTo: [], appliedTo: [], tags: ['strong'], noteCount: 0, lastNote: null,
};

beforeEach(() => { vi.clearAllMocks(); who.role = 'OWNER'; who.jobIds = null; });

describe('talent filters', () => {
  it('cleans anything saved or sent: unknown options dropped, text trimmed', () => {
    expect(cleanTalentFilters({ q: '  react ', exp: '99', stage: 'interviewed', within: '30d', evil: 1 }))
      .toEqual({ q: 'react', skill: '', tag: '', exp: '', stage: 'interviewed', within: '30d' });
    expect(cleanTalentFilters(null)).toEqual({ q: '', skill: '', tag: '', exp: '', stage: '', within: '' });
  });

  it('experience, furthest stage and applied-within all narrow the list', () => {
    const f = cleanTalentFilters({ exp: '3-5', stage: 'interviewed', within: '30d' });
    expect(matchesTalentFilters(base, f)).toBe(true);
    expect(matchesTalentFilters({ ...base, experienceYears: 8 }, f)).toBe(false);
    expect(matchesTalentFilters({ ...base, experienceYears: null }, f)).toBe(false);
    expect(matchesTalentFilters({ ...base, furthestRank: 1 }, f)).toBe(false);
    expect(matchesTalentFilters({ ...base, appliedAt: new Date(Date.now() - 40 * DAY).toISOString() }, f)).toBe(false);
    expect(describeFilters(f)).toBe('3–5 years · Interviewed or further · Last 30 days');
  });
});

describe('saved searches', () => {
  it('save needs a name and at least one filter, stores clean filters and the saver’s email', async () => {
    expect((await saveSearch(req({ name: 'Any', filters: {} }))).status).toBe(400);
    expect((await saveSearch(req({ name: 'x', filters: { skill: 'React' } }))).status).toBe(400);
    const res = await saveSearch(req({ name: 'React people', filters: { skill: 'React', exp: 'bogus' } }));
    expect(res.status).toBe(200);
    expect(db.jobBoardSavedTalentSearch.create.mock.calls[0][0].data).toMatchObject({
      employerId: 'emp1', name: 'React people', alert: true, createdByEmail: 'hr@acme.co', filters: { skill: 'React', exp: '' },
    });
  });

  it('at most 20 per company', async () => {
    db.jobBoardSavedTalentSearch.count.mockResolvedValueOnce(20);
    expect((await saveSearch(req({ name: 'One more', filters: { skill: 'React' } }))).status).toBe(409);
  });

  it('interviewers limited to some jobs can’t see or save pool searches', async () => {
    who.role = 'INTERVIEWER'; who.jobIds = ['j1'];
    expect((await listSearches()).status).toBe(403);
    expect((await saveSearch(req({ name: 'React', filters: { skill: 'React' } }))).status).toBe(403);
  });

  it('change and delete are scoped to the company; turning alerts on starts from now', async () => {
    await patchSearch(req({ alert: true }, 'PATCH'), params('s1'));
    const call = (db.jobBoardSavedTalentSearch.updateMany.mock.calls[0] as any)[0];
    expect(call.where).toEqual({ id: 's1', employerId: 'emp1' });
    expect(call.data.alert).toBe(true);
    expect(call.data.lastAlertAt).toBeInstanceOf(Date);
    db.jobBoardSavedTalentSearch.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect((await deleteSearch(req({}, 'DELETE'), params('other-company'))).status).toBe(404);
  });
});

describe('bulk invite', () => {
  beforeEach(() => {
    db.jobBoardListing.findFirst.mockResolvedValue({ id: 'L1', title: 'Backend', slug: 'backend' });
    db.jobBoardApplication.findFirst.mockImplementation(async (a: any) => (a.where.id ? { id: a.where.id, email: `${a.where.id}@x.co`, fullName: 'Pat Lee' } : null));
  });

  it('needs the move permission, at least one person and at most 50', async () => {
    who.role = 'INTERVIEWER';
    expect((await bulkInvite(req({ applicationIds: ['a1'], listingId: 'L1' }))).status).toBe(403);
    who.role = 'OWNER';
    expect((await bulkInvite(req({ applicationIds: [], listingId: 'L1' }))).status).toBe(400);
    expect((await bulkInvite(req({ applicationIds: Array.from({ length: 51 }, (_, i) => `a${i}`), listingId: 'L1' }))).status).toBe(400);
  });

  it('invites each person once (duplicates ignored) and reports who was skipped', async () => {
    db.jobBoardTalentInvite.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old' } as any);
    const res = await bulkInvite(req({ applicationIds: ['a1', 'a2', 'a1'], listingId: 'L1' }));
    const d = await res.json();
    expect(d).toMatchObject({ invited: 1, already_invited: 1, invitedIds: ['a1'], listingTitle: 'Backend' });
    expect(db.jobBoardTalentInvite.create).toHaveBeenCalledTimes(1);
  });

  it('stops at the daily cap of 100, counting every kind of invite', async () => {
    db.jobBoardTalentInvite.count.mockResolvedValueOnce(99);
    const d = await (await bulkInvite(req({ applicationIds: ['a1', 'a2', 'a3'], listingId: 'L1' }))).json();
    expect(d).toMatchObject({ invited: 1, skippedForCap: 2 });
    expect((db.jobBoardTalentInvite.count.mock.calls[0] as any)[0].where.Listing).toEqual({ employerId: 'emp1' });
    db.jobBoardTalentInvite.count.mockResolvedValueOnce(100);
    expect((await bulkInvite(req({ applicationIds: ['a1'], listingId: 'L1' }))).status).toBe(429);
    db.jobBoardTalentInvite.count.mockResolvedValueOnce(100);
    expect((await singleInvite(req({ applicationId: 'a1', listingId: 'L1' }))).status).toBe(429);
  });
});

describe('saved search alerts', () => {
  const search = (over: Record<string, unknown> = {}) => ({
    id: 's1', name: 'React people', filters: { skill: 'React' }, createdByEmail: 'hr@acme.co', lastAlertAt: new Date(Date.now() - 2 * DAY),
    employerId: 'emp1', Employer: { email: 'hr@acme.co' }, ...over,
  });
  const poolRow = (id: string, appliedAt: Date, skills: string[]) => ({
    id, email: `${id}@x.co`, fullName: `Person ${id}`, currentTitle: null, currentCompany: null, city: null, experienceYears: 3, confirmedSkills: skills,
    appliedAt, status: 'APPLIED', talentPoolUntil: new Date(Date.now() + 300 * DAY), withdrawnAt: null, listingId: 'L0',
    Listing: { title: 'Frontend', isGeneral: false }, TalentInvites: [], talentTags: [],
  });

  it('emails only people who joined since the last alert and match, then moves the clock on', async () => {
    db.jobBoardSavedTalentSearch.findMany.mockResolvedValueOnce([search()]);
    db.jobBoardApplication.findMany.mockResolvedValue([
      poolRow('new', new Date(Date.now() - DAY), ['React']),
      poolRow('old', new Date(Date.now() - 5 * DAY), ['React']),
      poolRow('other', new Date(Date.now() - DAY), ['Go']),
    ]);
    const r = await runTalentAlerts(new Date());
    expect(r.emailed).toBe(1);
    const sent = (mail.sendEmail.mock.calls[0] as any)[0];
    expect(sent.to).toBe('hr@acme.co');
    expect(sent.subject).toContain('1 new person matches');
    expect(sent.html).toContain('Person new');
    expect(sent.html).not.toContain('Person old');
    expect(sent.html).not.toContain('Person other');
    expect(db.jobBoardSavedTalentSearch.update).toHaveBeenCalledTimes(1);
  });

  it('sends nothing to a teammate who left or is limited to some jobs', async () => {
    db.jobBoardSavedTalentSearch.findMany.mockResolvedValueOnce([search({ createdByEmail: 'gone@acme.co' })]);
    db.jobBoardTeamMember.findFirst.mockResolvedValueOnce(null);
    const r = await runTalentAlerts(new Date());
    expect(r).toMatchObject({ emailed: 0, skippedRecipient: 1 });
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });
});

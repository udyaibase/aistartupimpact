import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
  const fn = () => vi.fn(async (..._a: any[]): Promise<any> => null);
  return {
    jobBoardApplication: { findFirst: fn(), update: fn(), updateMany: vi.fn(async (..._a: any[]): Promise<any> => ({ count: 2 })) },
    webUser: { findUnique: fn(), updateMany: fn() },
  };
});
const otp = vi.hoisted(() => ({ create: vi.fn(async (..._a: any[]) => ({ otp: '123456' })), check: vi.fn(async (..._a: any[]): Promise<any> => ({ ok: true })) }));
const status = vi.hoisted(() => ({ find: vi.fn(async (..._a: any[]): Promise<any> => null), erase: vi.fn(async (..._a: any[]) => undefined) }));
const session = vi.hoisted(() => ({ user: null as any }));
const mail = vi.hoisted(() => ({ code: vi.fn() }));

vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: {} }));
vi.mock('@/lib/otp', () => ({ createOtp: otp.create, checkEmailCode: otp.check }));
vi.mock('@/lib/jobs/candidate-status', () => ({ findByStatusToken: status.find, eraseApplication: status.erase }));
vi.mock('@/lib/jobs/talent-pool', () => ({ leavePool: vi.fn(), POOL_DAYS: 365 }));
vi.mock('@/lib/jobs/candidate-emails', () => ({ sendCandidateCode: mail.code }));
vi.mock('@/lib/user-session', () => ({ getUserSession: async () => session.user }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => 'ip', authRateLimit: {} }));
vi.mock('@/lib/event-rate-limit', () => ({ applicationStatusRateLimit: {} }));

import { POST as TOKEN_ACTION } from '@/app/api/applications/[token]/route';
import { POST as MY_ACTION } from '@/app/api/user/applications/[id]/route';
import { claimApplications } from '@/lib/jobs/candidate-account';

const TOKEN = 'a'.repeat(32);
const post = (body: unknown) => TOKEN_ACTION(new NextRequest(`http://localhost/api/applications/${TOKEN}`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ token: TOKEN }) });
const app = { id: 'app1', email: 'riya@x.co', fullName: 'Riya Desai', withdrawnAt: null };

beforeEach(() => { vi.clearAllMocks(); session.user = null; });

describe('private link: withdraw and delete need an email code', () => {
  it('sends a code to the application email and shows it masked', async () => {
    status.find.mockResolvedValueOnce(app);
    const res = await post({ action: 'send_code' });
    expect(await res.json()).toEqual({ success: true, sentTo: 'r•••@x.co' });
    expect(mail.code).toHaveBeenCalledWith({ to: 'riya@x.co', code: '123456', purpose: 'app_action' });
  });
  it('refuses without a code, or with a wrong one, and changes nothing', async () => {
    status.find.mockResolvedValue(app);
    expect((await post({ action: 'withdraw' })).status).toBe(400);
    otp.check.mockResolvedValueOnce({ ok: false, reason: 'wrong', left: 2 });
    const res = await post({ action: 'delete', code: '000000' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('2 tries left');
    expect(db.jobBoardApplication.update).not.toHaveBeenCalled();
    expect(status.erase).not.toHaveBeenCalled();
  });
  it('acts with the right code', async () => {
    status.find.mockResolvedValue(app);
    expect((await post({ action: 'withdraw', code: '123456' })).status).toBe(200);
    expect(otp.check).toHaveBeenCalledWith('riya@x.co', 'app_action', '123456', { whenSpent: 'delete' });
    expect(db.jobBoardApplication.update).toHaveBeenCalled();
    expect((await post({ action: 'delete', code: '123456' })).status).toBe(200);
    expect(status.erase).toHaveBeenCalledWith('app1');
  });
});

describe('linking past applications to an account', () => {
  it('never links to an unverified email', async () => {
    expect(await claimApplications({ id: 'u1', email: 'riya@x.co', name: 'Riya', emailVerified: false })).toBe(0);
    expect(db.jobBoardApplication.updateMany).not.toHaveBeenCalled();
  });
  it('links only their own applications: same email, unlinked, not a company import or unanswered sourcing', async () => {
    expect(await claimApplications({ id: 'u1', email: 'riya@x.co', name: 'Riya', emailVerified: true })).toBe(2);
    const where = db.jobBoardApplication.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ webUserId: null, email: { equals: 'riya@x.co', mode: 'insensitive' }, source: { not: 'IMPORTED' } });
    expect(where.OR).toEqual([{ sourcedState: null }, { sourcedState: 'INTERESTED' }]);
    expect(db.jobBoardApplication.updateMany.mock.calls[0][0].data).toEqual({ webUserId: 'u1' });
  });
});

describe('My applications actions', () => {
  const act = (id: string, body: unknown) => MY_ACTION(new NextRequest(`http://localhost/api/user/applications/${id}`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  it('needs a signed-in account', async () => {
    expect((await act('app1', { action: 'withdraw' })).status).toBe(401);
  });
  it('only touches the signed-in person’s own application', async () => {
    session.user = { id: 'u1', email: 'riya@x.co', name: 'Riya' };
    db.webUser.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(null);
    expect((await act('someone-else', { action: 'delete' })).status).toBe(404);
    expect(db.jobBoardApplication.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'someone-else', webUserId: 'u1' });
    expect(status.erase).not.toHaveBeenCalled();
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'app1', withdrawnAt: null });
    expect((await act('app1', { action: 'delete' })).status).toBe(200);
    expect(status.erase).toHaveBeenCalledWith('app1');
  });
});
